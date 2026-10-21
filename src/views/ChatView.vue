<template>
  <div class="chat-app">
    <!-- 左侧：历史会话列表 -->
    <aside class="sidebar">
      <el-button type="primary" class="new-chat-btn" @click="newChat">
        ＋ 新建会话
      </el-button>

      <div class="session-list">
        <div
          v-for="(session, index) in sessions"
          :key="session.id"
          :class="['session-item', { active: session.id === chatId }]"
          @click="switchSession(session.id)"
        >
          <span class="session-title">{{ session.title }}</span>
          <el-icon class="delete-icon" @click.stop="deleteSession(index)">
            <Close />
          </el-icon>
        </div>
      </div>
    </aside>

    <!-- 右侧：聊天区域 -->
    <main class="chat-main">
      <div class="header">
        <el-button size="small" @click="$emit('back')">← 返回</el-button>
        <h2>🤖 {{ currentTitle }}</h2>
      </div>

      <div class="message-list" ref="messageList">
        <div v-if="messages.length === 0" class="empty-tip">
          开始一段新对话吧 ✨
        </div>
        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="['message', msg.role]"
        >
          <div class="bubble">
            <span class="label">{{ msg.role === 'user' ? '我' : 'AI' }}</span>
            <p>{{ msg.content }}</p>
          </div>
        </div>
        <div v-if="loading" class="message ai">
          <div class="bubble">
            <span class="label">AI</span>
            <p>思考中...</p>
          </div>
        </div>
      </div>

      <div class="input-area">
        <el-input
          v-model="inputMessage"
          placeholder="请输入消息..."
          @keyup.enter="sendMessage"
          :disabled="loading"
          size="large"
        />
        <el-button type="primary" size="large" @click="sendMessage" :loading="loading">
          发送
        </el-button>
      </div>
    </main>
  </div>
</template>

<script>
import { http, unwrapResult } from '../api/request'
import { Close } from '@element-plus/icons-vue'

export default {
  components: { Close },
  data() {
    return {
      sessions: [],       // 所有会话 [{id, title, messages}]
      chatId: '',         // 当前激活的会话ID
      inputMessage: '',
      loading: false
    }
  },
  created() {
  const saved = localStorage.getItem('chatSessions')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // ✅ 兼容旧数据：确保每个 session 都有 messages 数组
      this.sessions = parsed.map(s => ({
        id: s.id,
        title: s.title || '新会话',
        messages: Array.isArray(s.messages) ? s.messages : []
      }))
    } catch (e) {
      this.sessions = []
    }
  }
  if (this.sessions.length > 0) {
    this.chatId = this.sessions[0].id
  } else {
    this.newChat()
  }
  },

  watch: {
    sessions: {
      deep: true,
      handler(val) {
        localStorage.setItem('chatSessions', JSON.stringify(val))
      }
    }
  },

  computed: {
    // 当前会话的消息
    messages() {
      const s = this.sessions.find(s => s.id === this.chatId)
      return s ? s.messages : []
    },
    // 当前会话标题
    currentTitle() {
      const s = this.sessions.find(s => s.id === this.chatId)
      return s ? s.title : 'AI 助手'
    }
  },
  
  methods: {
    generateChatId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
      return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    },
    newChat() {
      const id = this.generateChatId()
      this.sessions.unshift({
        id,
        title: '新会话',
        messages: []
      })
      this.chatId = id
      return {id}
    },
    switchSession(id) {
      this.chatId = id
      this.scrollToBottom()
    },
    deleteSession(index) {
      const removed = this.sessions.splice(index, 1)[0]
      // 如果删的是当前会话，切到第一个（没有就新建）
      if (removed.id === this.chatId) {
        if (this.sessions.length > 0) {
          this.chatId = this.sessions[0].id
        } else {
          this.newChat()
        }
      }
    },
    // 用第一条用户消息作为会话标题
    updateTitle(firstUserMsg) {
      const s = this.sessions.find(s => s.id === this.chatId)
      if (s && s.title === '新会话') {
        s.title = firstUserMsg.slice(0, 12) + (firstUserMsg.length > 12 ? '...' : '')
      }
    },
    async sendMessage() {
      const msg = this.inputMessage.trim()
      if (!msg || this.loading) return

      const session = this.sessions.find(s => s.id === this.chatId)
      if (!session) return

       // ✅ 第一条消息时更新标题（在 push 之前判断）
      if (session.title === '新会话') {
        session.title = msg.slice(0, 12) + (msg.length > 12 ? '...' : '')
      }

      session.messages.push({ role: 'user', content: msg })
      this.inputMessage = ''
      this.loading = true
      this.scrollToBottom()

      try {
        const res = await http.post('/api/ai/chat', {
          message: msg,
          chatId: this.chatId
        })
        session.messages.push({ role: 'ai', content: unwrapResult(res) })
      } catch (err) {
        session.messages.push({ role: 'ai', content: '❌ 请求失败：' + err.message })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.messageList
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  }
}
</script>

<style scoped>
/* 整体两栏布局 */
.chat-app {
  display: flex;
  height: 100vh;
  background: #f5f7fa;
}

/* ===== 左侧侧边栏 ===== */
.sidebar {
  width: 240px;
  background: #1f2937;
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  box-sizing: border-box;
}
.new-chat-btn {
  width: 100%;
  margin-bottom: 16px;
}
.session-list {
  flex: 1;
  overflow-y: auto;
}
.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}
.session-item:hover { background: #374151; }
.session-item.active { background: #409eff; color: white; }
.session-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delete-icon {
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}
.session-item:hover .delete-icon { opacity: 1; }

/* ===== 右侧聊天区 ===== */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
}
.header h2 { margin: 0 0 10px; }
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}
.empty-tip {
  text-align: center;
  color: #9ca3af;
  margin-top: 40%;
  font-size: 16px;
}
.message { margin-bottom: 12px; display: flex; }
.message.user { justify-content: flex-end; }
.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.message.user .bubble { background: #409eff; color: white; }
.label { font-size: 12px; opacity: 0.7; }
.bubble p { margin: 4px 0 0; white-space: pre-wrap; }
.input-area {
  display: flex;
  gap: 10px;
  padding-top: 10px;
  align-items: center;
}
.input-area .el-input { flex: 1; }
</style>
