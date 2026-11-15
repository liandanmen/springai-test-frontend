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
.kb-app { display: flex; height: 100vh; background: var(--bg-page); }

/* ===== 左侧文档栏 ===== */
.kb-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  box-sizing: border-box;
}
.sidebar-title { margin: 0; font-size: 15px; }
.upload-tip { margin: 0; font-size: 12px; color: var(--text-4); }
.document-list { flex: 1; overflow-y: auto; }
.doc-empty { color: var(--text-4); font-size: 13px; text-align: center; margin-top: var(--space-5); }
.document-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  transition: background .2s;
}
.document-item:hover { background: var(--bg-hover); }
.doc-info { flex: 1; min-width: 0; }
.doc-name { font-size: 13px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-meta { font-size: 12px; color: var(--text-4); }
.delete-icon { cursor: pointer; color: var(--text-4); transition: color .2s; }
.delete-icon:hover { color: #f56c6c; }

/* ===== 右侧问答区 ===== */
.kb-main {
  flex: 1;
  min-width: 0;              /* 去掉原来无效的 max-width: flex */
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  box-sizing: border-box;
}
.header h2 { margin: 0 0 var(--space-3); font-size: 18px; }
.message-list { flex: 1; overflow-y: auto; padding: var(--space-2) 0; }
.empty-tip { text-align: center; color: var(--text-4); margin-top: 30%; font-size: 14px; }
.message { margin-bottom: var(--space-4); display: flex; }
.message.user { justify-content: flex-end; }
.bubble {
  max-width: min(720px, 78%);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  font-size: 14px;
  line-height: 1.7;
}
.message.user .bubble { background: var(--color-primary); color: #fff; box-shadow: none; }
.label { font-size: 12px; opacity: .7; }
.answer { margin: var(--space-1) 0 0; white-space: pre-wrap; word-break: break-word; }
.pending { color: var(--text-4); font-size: 13px; }

.input-area { display: flex; gap: var(--space-3); padding-top: var(--space-3); align-items: center; }
.input-area .el-input { flex: 1; }

/* ===== 引用角标 ===== */
.cite {
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 600;
  padding: 0 1px;
  border-radius: 3px;
}
.cite:hover { background: var(--color-primary-light); text-decoration: underline; }

/* ===== 引用卡片 ===== */
.refs { margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); align-items: stretch; }
.ref-title { font-size: 12px; color: var(--text-4); }
.ref-item {
  border-left: 2px solid var(--border);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background .2s, border-color .2s;
}
.ref-item:hover { background: var(--bg-hover); }
.ref-item.active { border-left-color: var(--color-primary); background: var(--color-primary-light); }
.ref-badge { color: var(--color-primary); font-weight: 600; margin-right: var(--space-1); font-size: 12px; }
.ref-meta { font-size: 12px; color: var(--text-4); }
.ref-text {
  margin: var(--space-1) 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ref-item.active .ref-text { -webkit-line-clamp: unset; }
</style>