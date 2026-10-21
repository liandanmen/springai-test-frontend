<template>
  <div class="soup-app">
    <!-- 左侧：历史局 -->
    <aside class="sidebar">
      <el-button type="primary" class="new-btn" @click="newGame">＋ 新开一局</el-button>
      <div class="session-list">
        <div
          v-for="(s, index) in sessions"
          :key="s.id"
          :class="['session-item', { active: s.id === gameId }]"
          @click="switchGame(s.id)"
        >
          <span class="session-title">
            {{ s.status === 'playing' ? '🎮' : '🏁' }} {{ s.title }}
          </span>
          <el-icon class="delete-icon" @click.stop="deleteGame(index)">
            <Close />
          </el-icon>
        </div>
      </div>
    </aside>

    <!-- 右侧 -->
    <main class="main">
      <div class="header">
        <el-button size="small" @click="$emit('back')">← 返回</el-button>
        <h2>🐢 海龟汤</h2>
      </div>

      <!-- ✅ 上方：汤面 + 还原故事 + 汤底 -->
      <div class="soup-panel">
        <div class="panel-card surface">
          <h4> 汤面</h4>
          <p>{{ surface || '点击左侧"新开一局"开始游戏' }}</p>
        </div>
        <div class="panel-card story">
          <h4>📝 我还原的故事</h4>
          <p v-if="myStory">{{ myStory }}</p>
          <p v-else class="muted">还没提交。多问几个"是/否"问题后，试着还原真相吧。</p>
        </div>
        <div class="panel-card secret" v-if="secret">
          <h4>🔓 汤底（真相）</h4>
          <p>{{ secret }}</p>
        </div>
      </div>

      <!-- 中部：问答记录 -->
      <div class="message-list" ref="messageList">
        <div v-if="messages.length === 0" class="empty-tip">
          只能问"是/否"类问题，主持人只回答：是 / 否 / 无关
        </div>
        <div
          v-for="(m, i) in messages"
          :key="i"
          :class="['message', m.role === 'user' ? 'user' : 'ai']"
        >
          <div class="bubble">
            <span class="label">{{ m.role === 'user' ? '我问' : '主持' }}</span>
            <p>{{ m.content }}</p>
          </div>
        </div>
        <div v-if="loading" class="message ai">
          <div class="bubble"><p>思考中...</p></div>
        </div>
      </div>

      <!-- ✅ 下方：输入框 + 三个动作 -->
      <div class="input-area">
        <el-input
          v-model="inputMessage"
          placeholder="问一个是/否问题，或写下你还原的故事..."
          @keyup.enter="ask"
          :disabled="loading || !gameId || !!secret"
          size="large"
        />
        <el-button type="primary" size="large" @click="ask"
                   :loading="loading" :disabled="!gameId || !!secret">提问</el-button>
        <el-button type="warning" size="large" @click="guess"
                   :loading="loading" :disabled="!gameId || !!secret">提交还原</el-button>
        <el-button type="info" plain size="large" @click="reveal"
                   :disabled="!gameId || !!secret">揭汤底</el-button>
      </div>
    </main>
  </div>
</template>

<script>
import { http, unwrapResult } from '../api/request'
import { Close } from '@element-plus/icons-vue'

const BASE = '/api/soup'

export default {
  components: { Close },
  data() {
    return {
      sessions: [],     // [{id, title, status}]
      gameId: '',
      surface: '',      // 汤面
      myStory: '',      // 用户还原的故事（最近一次提交）
      secret: '',       // 汤底（揭晓后才有值）
      messages: [],     // 问答记录
      inputMessage: '',
      loading: false
    }
  },
  async created() {
    await this.loadSessions()
    if (this.sessions.length > 0) {
      await this.switchGame(this.sessions[0].id)
    }
  },
  methods: {
    genId() {
      return crypto.randomUUID ? crypto.randomUUID() : 'soup-' + Date.now()
    },
    async loadSessions() {
      try {
        const res = await http.get(`${BASE}/sessions`)
        this.sessions = unwrapResult(res)
      } catch (e) { console.error(e) }
    },
    // 新开一局
    async newGame() {
      const id = this.genId()
      try {
        const res = await http.post(`${BASE}/start`, { gameId: id })
        const data = unwrapResult(res)
        this.sessions.unshift({ id, title: data.surface.slice(0, 12) + '...', status: 'playing' })
        this.gameId = id
        this.surface = data.surface
        this.myStory = ''
        this.secret = ''
        this.messages = []
      } catch (e) { console.error(e) }
    },
    // 切换历史局：从后端加载汤面/状态/问答
    async switchGame(id) {
      this.gameId = id
      try {
        const res = await http.get(`${BASE}/${id}`)
        const data = unwrapResult(res)
        this.surface = data.surface
        this.secret = data.secret || ''
        this.messages = data.messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content
        }))
        // 最近一次"提交还原"的内容显示在上方
        const lastGuess = [...this.messages].reverse().find(m => m.role === 'user' && m.isGuess)
        this.myStory = lastGuess ? lastGuess.content : ''
      } catch (e) { console.error(e) }
      this.scrollToBottom()
    },
    async deleteGame(index) {
      const removed = this.sessions.splice(index, 1)[0]
      if (!removed) return
      try { await http.delete(`${BASE}/${removed.id}`) } catch (e) { console.error(e) }
      if (removed.id === this.gameId) {
        this.gameId = ''
        this.surface = ''
        this.messages = []
        this.myStory = ''
        this.secret = ''
      }
    },
    // 提问
    async ask() {
      const q = this.inputMessage.trim()
      if (!q || this.loading) return
      this.messages.push({ role: 'user', content: q })
      this.inputMessage = ''
      this.loading = true
      this.scrollToBottom()
      try {
        const res = await http.post(`${BASE}/ask`, { gameId: this.gameId, content: q })
        this.messages.push({ role: 'ai', content: unwrapResult(res) })
      } catch (e) {
        this.messages.push({ role: 'ai', content: '❌ ' + e.message })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },
    // 提交还原故事
    async guess() {
      const story = this.inputMessage.trim()
      if (!story || this.loading) return
      this.myStory = story                       // ✅ 显示到上方面板
      this.messages.push({ role: 'user', content: '【还原】' + story, isGuess: true })
      this.inputMessage = ''
      this.loading = true
      this.scrollToBottom()
      try {
        const res = await http.post(`${BASE}/guess`, { gameId: this.gameId, content: story })
        const answer = unwrapResult(res)
        this.messages.push({ role: 'ai', content: answer })
        // 判定正确 → 自动揭汤底
        if (answer.includes('[CORRECT]')) {
          const r = await http.get(`${BASE}/reveal`, { params: { gameId: this.gameId } })
          this.secret = unwrapResult(r)
          const s = this.sessions.find(x => x.id === this.gameId)
          if (s) s.status = 'solved'
        }
      } catch (e) {
        this.messages.push({ role: 'ai', content: '❌ ' + e.message })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },
    // 放弃，直接看汤底
    async reveal() {
      try {
        const res = await http.get(`${BASE}/reveal`, { params: { gameId: this.gameId } })
        this.secret = unwrapResult(res)
        const s = this.sessions.find(x => x.id === this.gameId)
        if (s) s.status = 'revealed'
      } catch (e) { console.error(e) }
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
.soup-app { display: flex; height: 100vh; background: #f5f7fa; }
.sidebar { width: 240px; background: #1f2937; color: #e5e7eb; padding: 16px 12px; display: flex; flex-direction: column; box-sizing: border-box; }
.new-btn { width: 100%; margin-bottom: 16px; }
.session-list { flex: 1; overflow-y: auto; }
.session-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; margin-bottom: 6px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.session-item:hover { background: #374151; }
.session-item.active { background: #409eff; color: white; }
.session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.delete-icon { opacity: 0; cursor: pointer; }
.session-item:hover .delete-icon { opacity: 1; }

.main { flex: 1; display: flex; flex-direction: column; padding: 16px 20px; box-sizing: border-box; }
.header { display: flex; align-items: center; gap: 12px; }
.header h2 { margin: 0; }

/* ✅ 上方面板 */
.soup-panel { display: flex; gap: 12px; margin: 12px 0; }
.panel-card { flex: 1; background: white; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); max-height: 140px; overflow-y: auto; }
.panel-card h4 { margin: 0 0 8px; font-size: 14px; }
.panel-card p { margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.panel-card.surface { border-left: 4px solid #409eff; }
.panel-card.story { border-left: 4px solid #e6a23c; }
.panel-card.secret { border-left: 4px solid #f56c6c; }
.muted { color: #c0c4cc; }

.message-list { flex: 1; overflow-y: auto; padding: 10px 0; }
.empty-tip { text-align: center; color: #9ca3af; margin-top: 15%; }
.message { margin-bottom: 12px; display: flex; }
.message.user { justify-content: flex-end; }
.bubble { max-width: 70%; padding: 10px 14px; border-radius: 10px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.message.user .bubble { background: #409eff; color: white; }
.label { font-size: 12px; opacity: .7; }
.bubble p { margin: 4px 0 0; white-space: pre-wrap; }

.input-area { display: flex; gap: 10px; padding-top: 10px; align-items: center; }
.input-area .el-input { flex: 1; }
</style>
