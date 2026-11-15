<template>
  <div class="kb-app">
    <!-- ===== 左侧：文档 ===== -->
    <aside class="kb-sidebar">
      <h3 class="sidebar-title">我的文档</h3>

      <el-upload :show-file-list="false" accept=".txt,.md" :http-request="uploadFile">
        <el-button type="primary" :loading="uploading" style="width: 100%">
          ＋ 上传文档
        </el-button>
      </el-upload>
      <p class="upload-tip">支持 .txt / .md，最大 2MB</p>

      <div v-loading="listLoading" class="document-list">
        <div v-if="!documents.length" class="doc-empty">还没有文档，先上传一个</div>
        <div v-for="doc in documents" :key="doc.id" class="document-item">
          <div class="doc-info">
            <div class="doc-name">{{ doc.fileName }}</div>
            <div class="doc-meta">{{ doc.chunkCount }} 段 · {{ doc.charCount }} 字</div>
          </div>
          <el-icon class="delete-icon" @click="removeDocument(doc)"><Close /></el-icon>
        </div>
      </div>
    </aside>

    <!-- ===== 右侧：对话（原来的 kb-main 保持不动）===== -->
    <!-- ===== 右侧：对话 ===== -->
<main class="kb-main">
  <div class="header">
    <el-button size="small" @click="$emit('back')">← 返回</el-button>
    <h2>📚 文档智能问答助手</h2>
  </div>

  <div class="message-list" ref="messageList">
    <div v-if="messages.length === 0" class="empty-tip">
      上传文档后，就可以针对文档内容提问了
    </div>

    <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
      <div class="bubble">
        <span class="label">{{ msg.role === 'user' ? '我' : '助手' }}</span>

        <!-- 用户消息：纯文本 -->
        <p v-if="msg.role === 'user'" class="answer">{{ msg.content }}</p>

        <!-- 助手消息：v-html，把 [1] 渲染成可点击 -->
        <template v-else>
          <span v-if="msg.pending && !msg.content" class="pending">正在检索…</span>
          <p v-else class="answer"
             v-html="renderAnswer(msg.content)"
             @click="onCiteClick(msg, $event)"></p>
        </template>

        <!-- 引用区 -->
        <div v-if="msg.refs && msg.refs.length" class="refs">
          <div class="ref-title">引用</div>
          <div v-for="ref in msg.refs" :key="ref.index"
               :class="['ref-item', { active: msg.activeRef === ref.index }]">
            <span class="ref-badge">[{{ ref.index }}]</span>
            <span class="ref-meta">
              {{ ref.fileName }} · 第{{ ref.chunkIndex + 1 }}段 · {{ ref.score.toFixed(2) }}
            </span>
            <p class="ref-text">{{ ref.content }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="input-area">
    <el-input v-model="inputMessage" placeholder="例如：年假有几天？"
              @keyup.enter="sendMessage" :disabled="loading" size="large" />
    <el-button type="primary" size="large" @click="sendMessage" :loading="loading">
      发送
    </el-button>
  </div>
</main>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'          // ← 图标要单独导入
import { http, unwrapResult } from '../api/request'

export default {
  components: { Close },                                   // ← 注册
  data() {
    return {
      documents: [],        // ← 改叫 documents，别用 document（浏览器有同名全局对象）
      listLoading: false,
      uploading: false,
      messages: [],
      inputMessage: '',
      loading: false
    }
  },
  mounted() {                                            // ← 关键：进页面就加载
    this.loadDocuments()
  },
  methods: {
    async loadDocuments() {
      this.listLoading = true
      try {
        const data = unwrapResult(await http.get('/api/kb/documents'))
        this.documents = data || []
      } catch (err) {
        this.documents = []
        ElMessage.error(err.response?.data?.msg || '加载文档失败')
      } finally {
        this.listLoading = false
      }
    },

    async uploadFile(options) {                    
      const file = options.file
      if (!file) return
      this.uploading = true
      try {
        const form = new FormData()
        form.append('file', file,file.name)               // ← key 必须叫 file，和后端 @RequestParam("file") 对齐
        const data = unwrapResult(await http.post('/api/kb/upload', form))
        ElMessage.success(`已索引 ${data.chunkCount} 段，共 ${data.charCount} 字`)
        options.onSuccess?.(data)   //通知父组件上传成功
        await this.loadDocuments()              // ← 刷新左侧
      } catch (err) {
        ElMessage.error(err.response?.data?.msg || '上传失败')
        options.onError?.(err)
      } finally {
        this.uploading = false
      }
    },

    async removeDocument(doc) {
      try {
        await ElMessageBox.confirm(`确定删除《${doc.fileName}》？`, '提示', { type: 'warning' })
      } catch {
        return                                  // 点了取消
      }
      try {
        unwrapResult(await http.delete(`/api/kb/document/${doc.id}`))
        ElMessage.success('删除成功')
        options.onSuccess?.(doc)   //通知父组件删除成功
        await this.loadDocuments()
      } catch (err) {
        ElMessage.error(err.response?.data?.msg || '删除失败')
        options.onError?.(err)
      }
    },
    // ① 把 [n] 渲染成可点击的标签
    //    顺序很重要：先转义 HTML，再插标签（反了就是 XSS 漏洞）
    renderAnswer(text) {
      if (!text) return ''
      const esc = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return esc.replace(/\[(\d+)\]/g, '<span class="cite" data-idx="$1">[$1]</span>')
    },

    // ② 点 [n] → 高亮对应的引用，再点一次收起
    onCiteClick(msg, e) {
      const idx = e.target?.dataset?.idx
      if (!idx) return
      msg.activeRef = msg.activeRef === Number(idx) ? null : Number(idx)
    },

    async sendMessage() {
  const question = this.inputMessage.trim()
  if (!question || this.loading) return

  this.messages.push({ role: 'user', content: question })

  const aiIndex = this.messages.length
  this.messages.push({ role: 'ai', content: '', refs: [], activeRef: null, pending: true })

  this.inputMessage = ''
  this.loading = true
  this.scrollToBottom()

  const ai = () => this.messages[aiIndex]

  try {
    const token = localStorage.getItem('authToken')
    const response = await fetch(http.defaults.baseURL + '/api/kb/ask/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ question })          // ★ 字段名 question，值用 question
    })

    // token 单次轮换
    const rotated = response.headers.get('authorization')
    if (rotated) localStorage.setItem('authToken', rotated.replace(/^Bearer\s+/i, ''))

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-expired'))
        ai().content = '❌ 未登录或登录已过期'
      } else {
        ai().content = '❌ ' + (data?.msg || response.status)
      }
      return
    }

    // 全局异常处理器会把错误包成 200 的 JSON，必须校验 Content-Type
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      const data = await response.json().catch(() => null)
      ai().content = '❌ ' + (data?.msg || '接口返回异常')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = 'message'
    let dataLines = []

    const dispatch = (evt, data) => {
      if (evt === 'refs') {
        try { ai().refs = JSON.parse(data) } catch { ai().refs = [] }
      } else if (evt === 'message') {
        ai().content += data                  // ★ 累加，不是覆盖
        ai().pending = false
      } else if (evt === 'error') {
        ai().content += '\n\n❌ ' + data
        ai().pending = false
      }
      this.scrollToBottom()
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const t = line.replace(/\r$/, '')
        if (t.startsWith('event:')) {
          currentEvent = t.slice(6).trim()
        } else if (t.startsWith('data:')) {
          dataLines.push(t.slice(5))
        } else if (t === '' && dataLines.length) {
          dispatch(currentEvent, dataLines.join('\n'))
          currentEvent = 'message'            // ★ 重置
          dataLines = []
        }
      }
    }

    if (!ai().content) ai().content = '（没有收到内容，请看后端控制台）'
  } catch (err) {
    ai().content = '❌ 请求失败：' + err.message
  } finally {
    ai().pending = false
    this.loading = false
    this.scrollToBottom()
  }
},
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.messageList;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  }
}
</script>

<style scoped>
.kb-app { display: flex; height: 100vh; background: #f5f7fa; }
.new-btn { width: 100%; margin-bottom: 16px; }
.sidebar-title { margin: 0; font-size: 15px; }
.upload-tip { margin: 0; font-size: 12px; color: #909399; }
.document-list { flex: 1; overflow-y: auto; }
.doc-empty { color: #9ca3af; font-size: 13px; text-align: center; margin-top: 20px; }
.document-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border-radius: 6px; cursor: default;
}
.document-item:hover { background: #f5f7fa; }
.doc-info { flex: 1; min-width: 0; }
.doc-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-meta { font-size: 12px; color: #909399; }
.delete-icon { cursor: pointer; color: #c0c4cc; }
.delete-icon:hover { color: #f56c6c; }
.kb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  max-width: flex;
  margin: 0 auto;
}
.header h2 { margin: 0 0 10px; }
.message-list { flex: 1; overflow-y: auto; padding: 10px 0; }
.empty-tip { text-align: center; color: #9ca3af; margin-top: 40%; font-size: 16px; }
.message { margin-bottom: 12px; display: flex; }
.message.user { justify-content: flex-end; }
.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,.06);
}
.message.user .bubble { background: #409eff; color: white; }
.label { font-size: 12px; opacity: .7; }
.bubble p { margin: 4px 0 0; white-space: pre-wrap; }
.refs { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.ref-title { font-size: 12px; color: #909399; }
.ref-tag { max-width: 100%; }
.input-area { display: flex; gap: 10px; padding-top: 10px; align-items: center; }
.input-area .el-input { flex: 1; }
.kb-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #ebeef5;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.answer { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; }
.pending { color: #909399; font-size: 13px; }

/* 引用角标 */
.cite {
  color: #409eff;
  cursor: pointer;
  font-weight: 600;
  padding: 0 1px;
}
.cite:hover { text-decoration: underline; }

/* 引用卡片 */
.ref-item {
  border-left: 2px solid #dcdfe6;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
}
.ref-item.active { border-left-color: #409eff; background: #ecf5ff; }
.ref-badge { color: #409eff; font-weight: 600; margin-right: 6px; font-size: 12px; }
.ref-meta { font-size: 12px; color: #909399; }
.ref-text {
  margin: 4px 0 0;
  font-size: 12px;
  color: #606266;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ref-item.active .ref-text { -webkit-line-clamp: unset; }
</style>
