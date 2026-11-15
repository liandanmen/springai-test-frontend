<template>
  <div class="soup-app">
    <!-- ===== 左侧：历史局 ===== -->
    <aside class="sidebar">
      <el-button type="primary" class="new-btn" @click="newGame">＋ 新开一局</el-button>
      <div class="session-list">
        <div
          v-for="s in sessions"
          :key="s.id"
          :class="['session-item', { active: s.id === gameId }]"
          @click="switchGame(s.id)"
        >
          <span class="session-title">{{ statusIcon(s.status) }} {{ s.title }}</span>
          <el-icon class="delete-icon" @click.stop="deleteGame(s)">
            <Close />
          </el-icon>
        </div>
      </div>
    </aside>

    <!-- ===== 右侧 ===== -->
    <main class="main">
      <div class="header">
        <el-button size="small" @click="$emit('back')">← 返回</el-button>
        <h2>🐢 海龟汤</h2>
        <el-tag v-if="isEnded" :type="status === 'solved' ? 'success' : 'info'" size="small">
          {{ statusText }}
        </el-tag>
      </div>

      <!-- 上方：汤面 / 我还原的故事 / 汤底 -->
      <div class="soup-panel">
        <div class="panel-card surface">
          <h4>汤面</h4>
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

      <!-- 结束横幅 -->
      <div v-if="isEnded" class="end-banner" :class="status">
        <span>{{ endTip }}</span>
        <el-button size="small" type="primary" @click="newGame">再来一局</el-button>
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
            <span class="label">{{ m.role === 'user' ? (m.isGuess ? '我的还原' : '我问') : '主持' }}</span>
            <!-- 判定标记：把 [CORRECT]/[WRONG] 变成标签，不把原始标记给用户看 -->
            <div v-if="judgeTag(m.content)" :class="['judge-tag', judgeTag(m.content)]">
              {{ judgeTag(m.content) === 'correct' ? '✓ 真相大白' : '✗ 还差一点' }}
            </div>
            <p>{{ stripMark(m.content) }}</p>
          </div>
        </div>
        <div v-if="loading" class="message ai">
          <div class="bubble"><p>思考中...</p></div>
        </div>
      </div>

      <!-- 下方：输入 + 三个动作 -->
      <div class="input-area">
        <el-input
          v-model="inputMessage"
          :placeholder="placeholder"
          :disabled="locked"
          @keyup.enter="ask"
          size="large"
        />
        <el-button type="primary" size="large" :loading="loading" :disabled="locked" @click="ask">
          提问
        </el-button>
        <el-button type="warning" size="large" :disabled="locked" @click="guess">
          提交还原
        </el-button>
        <el-button type="info" plain size="large" :disabled="locked" @click="reveal">
          揭汤底
        </el-button>
      </div>
    </main>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import { http, unwrapResult } from '../api/request'

const BASE = '/api/soup'

export default {
  components: { Close },
  data() {
    return {
      sessions: [],     // [{ id, title, status }]
      gameId: '',
      surface: '',
      myStory: '',
      secret: '',
      status: '',       // '' | playing | solved | revealed
      messages: [],     // [{ role:'user'|'ai', content, isGuess }]
      inputMessage: '',
      loading: false,
      lastWasWrong: false
    }
  },
  computed: {
    // 本局是否已结束（猜对 或 已揭底）
    isEnded() {
      return this.status === 'solved' || this.status === 'revealed'
    },
    // 输入区是否锁住：没选局、已结束、请求中都锁
    locked() {
      return !this.gameId || this.isEnded || this.loading
    },
    statusText() {
      if (this.status === 'solved') return '已解开'
      if (this.status === 'revealed') return '已揭底'
      return ''
    },
    endTip() {
      return this.status === 'solved'
        ? '🎉 你自己解开了这局，真相已写在上面。'
        : '🙈 你已揭晓汤底，本局结束。'
    },
    placeholder() {
      if (this.isEnded) return '本局已结束，点"新开一局"继续'
      if (this.lastWasWrong) return '继续提问，或重新写下你的还原故事…'
      return '问一个是/否问题，或写下你还原的故事…'
    }
  },
  async created() {
    await this.loadSessions()
    if (this.sessions.length > 0) await this.switchGame(this.sessions[0].id)
  },
  methods: {
    genId() {
      return crypto.randomUUID ? crypto.randomUUID() : 'soup-' + Date.now()
    },
    statusIcon(status) {
      if (status === 'solved') return '🏆'
      if (status === 'revealed') return '👀'
      return '🎮'
    },

    // ---------- 判定标记 ----------
    // [CORRECT] / [WRONG] 只用来驱动界面，不直接展示给用户
    judgeTag(text) {
      if (!text) return ''
      if (text.startsWith('[CORRECT]')) return 'correct'
      if (text.startsWith('[WRONG]')) return 'wrong'
      return ''
    },
    stripMark(text) {
      return (text || '').replace(/^\[(CORRECT|WRONG)\]\s*/, '')
    },

    // ---------- 列表 ----------
    async loadSessions() {
      try {
        this.sessions = unwrapResult(await http.get(`${BASE}/sessions`)) || []
      } catch (e) {
        this.sessions = []
        ElMessage.error(e.response?.data?.msg || '加载历史局失败')
      }
    },
    syncSessionStatus() {
      const s = this.sessions.find(x => x.id === this.gameId)
      if (s) s.status = this.status
    },

    // ---------- 新开 / 切换 / 删除 ----------
    async newGame() {
      const id = this.genId()
      try {
        const data = unwrapResult(await http.post(`${BASE}/start`, { gameId: id }))
        this.sessions.unshift({ id, title: (data.surface || '').slice(0, 12) + '…', status: 'playing' })
        this.gameId = id
        this.surface = data.surface
        this.status = 'playing'
        this.myStory = ''
        this.secret = ''
        this.messages = []
        this.inputMessage = ''
        this.lastWasWrong = false
      } catch (e) {
        ElMessage.error(e.response?.data?.msg || '开局失败')
      }
    },

    async switchGame(id) {
      this.gameId = id
      this.inputMessage = ''
      this.lastWasWrong = false
      await this.reloadGame()
      this.scrollToBottom()
    },

    // 从后端重新拉这一局（汤面/状态/汤底/问答）
    async reloadGame() {
      if (!this.gameId) return
      try {
        const data = unwrapResult(await http.get(`${BASE}/${this.gameId}`))
        this.surface = data.surface || ''
        this.status = data.status || 'playing'
        this.secret = data.secret || ''
        this.messages = (data.messages || []).map(m => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content,
          isGuess: !!m.isGuess            // ★ 之前这里丢了，导致"我还原的故事"恢复不出来
        }))
        const lastGuess = [...this.messages].reverse().find(m => m.isGuess)
        this.myStory = lastGuess ? this.stripMark(lastGuess.content) : ''
        this.syncSessionStatus()
      } catch (e) {
        ElMessage.error(e.response?.data?.msg || '加载本局失败')
      }
    },

    async deleteGame(session) {
      try {
        await ElMessageBox.confirm('确定删除这一局？记录无法恢复。', '提示', { type: 'warning' })
      } catch {
        return
      }
      try {
        await http.delete(`${BASE}/${session.id}`)
        this.sessions = this.sessions.filter(x => x.id !== session.id)
        if (session.id === this.gameId) {
          this.gameId = ''
          this.surface = ''
          this.messages = []
          this.myStory = ''
          this.secret = ''
          this.status = ''
        }
      } catch (e) {
        ElMessage.error(e.response?.data?.msg || '删除失败')
      }
    },

    // ---------- 提问 ----------
    async ask() {
      const q = this.inputMessage.trim()
      if (!q || this.locked) return
      this.messages.push({ role: 'user', content: q, isGuess: false })
      this.inputMessage = ''
      this.loading = true
      this.scrollToBottom()
      try {
        const answer = unwrapResult(await http.post(`${BASE}/ask`, { gameId: this.gameId, content: q }))
        this.messages.push({ role: 'ai', content: answer, isGuess: false })
        // 后端在非 playing 状态会返回提示语，同步一下状态
        if (answer === '本局已结束，请新开一局。') await this.reloadGame()
      } catch (e) {
        this.messages.push({ role: 'ai', content: '❌ ' + (e.response?.data?.msg || e.message) })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },

    // ---------- 提交还原 ----------
    async guess() {
      const story = this.inputMessage.trim()
      if (!story || this.locked) return

      try {
        await ElMessageBox.confirm(
          '提交后主持人会判定你还原得对不对。猜错不影响继续提问，猜对则本局通关。',
          '提交还原故事',
          { type: 'warning', confirmButtonText: '提交', cancelButtonText: '再想想' }
        )
      } catch {
        return
      }

      this.messages.push({ role: 'user', content: story, isGuess: true })
      this.myStory = story
      this.inputMessage = ''
      this.loading = true
      this.lastWasWrong = false
      this.scrollToBottom()

      try {
        const answer = unwrapResult(await http.post(`${BASE}/guess`, { gameId: this.gameId, content: story }))
        this.messages.push({ role: 'ai', content: answer, isGuess: false })

        if (this.judgeTag(answer) === 'correct') {
          // 猜对：后端已把状态改成 solved，直接从 detail 取汤底
          // ⚠️ 不要再调 /reveal —— 那会把 solved 覆盖成 revealed，丢失"自己猜对"这个事实
          await this.reloadGame()
        } else {
          this.lastWasWrong = true
          this.syncSessionStatus()
        }
      } catch (e) {
        this.messages.push({ role: 'ai', content: '❌ ' + (e.response?.data?.msg || e.message) })
      } finally {
        this.loading = false
        this.scrollToBottom()
      }
    },

    // ---------- 主动揭汤底 ----------
    async reveal() {
      try {
        await ElMessageBox.confirm(
          '揭晓汤底后本局立即结束，将无法再提问。确定要看吗？',
          '揭晓汤底',
          { type: 'warning', confirmButtonText: '我要看汤底', cancelButtonText: '继续推理' }
        )
      } catch {
        return
      }
      try {
        this.secret = unwrapResult(await http.get(`${BASE}/reveal`, { params: { gameId: this.gameId } }))
        this.status = 'revealed'
        this.syncSessionStatus()
      } catch (e) {
        ElMessage.error(e.response?.data?.msg || '揭底失败')
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
.soup-app { display: flex; height: 100vh; background: var(--bg-page); }

/* ===== 左侧历史局 ===== */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-3);
  box-sizing: border-box;
}
.new-btn { width: 100%; margin-bottom: var(--space-4); }
.session-list { flex: 1; overflow-y: auto; }
.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  margin-bottom: var(--space-1);
  border-radius: var(--radius-md);
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  transition: background .2s, color .2s;
}
.session-item:hover { background: var(--bg-hover); }
.session-item.active { background: var(--color-primary-light); color: var(--color-primary); font-weight: 500; }
.session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.delete-icon { opacity: 0; color: var(--text-4); cursor: pointer; transition: opacity .2s, color .2s; }
.delete-icon:hover { color: #f56c6c; }
.session-item:hover .delete-icon { opacity: 1; }

/* ===== 右侧主区 ===== */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  box-sizing: border-box;
}
.header { display: flex; align-items: center; gap: var(--space-3); }
.header h2 { margin: 0; font-size: 18px; }

/* 上方三块面板 */
.soup-panel { display: flex; gap: var(--space-3); margin: var(--space-4) 0; }
.panel-card {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-4);
  max-height: 140px;
  overflow-y: auto;
  box-sizing: border-box;
}
.panel-card h4 { margin: 0 0 var(--space-2); font-size: 13px; color: var(--text-3); font-weight: 600; }
.panel-card p { margin: 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.panel-card.surface { border-left: 3px solid var(--color-primary); }
.panel-card.story { border-left: 3px solid #e6a23c; }
.panel-card.secret { border-left: 3px solid #f56c6c; }
.muted { color: var(--text-4); }

/* 结束横幅 */
.end-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 10px var(--space-4);
  margin-bottom: var(--space-3);
  border-radius: var(--radius-md);
  font-size: 14px;
}
.end-banner.solved { background: #f0f9eb; color: #529b2e; border: 1px solid #e1f3d8; }
.end-banner.revealed { background: var(--bg-hover); color: var(--text-3); border: 1px solid var(--border); }

/* 问答记录 */
.message-list { flex: 1; overflow-y: auto; padding: var(--space-2) 0; }
.empty-tip { text-align: center; color: var(--text-4); margin-top: 20%; font-size: 14px; }
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
.bubble p { margin: var(--space-1) 0 0; white-space: pre-wrap; word-break: break-word; }

/* 判定标签：替代直接显示 [CORRECT]/[WRONG] */
.judge-tag {
  display: inline-block;
  margin-top: var(--space-2);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}
.judge-tag.correct { background: #f0f9eb; color: #529b2e; }
.judge-tag.wrong { background: #fdf6ec; color: #b88230; }

.input-area { display: flex; gap: var(--space-3); padding-top: var(--space-3); align-items: center; }
.input-area .el-input { flex: 1; }
</style>