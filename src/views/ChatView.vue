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
        <div v-if="messages.length === 0" class="empty-tip">开始一段新对话吧 ✨</div>
        <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
          <div class="bubble">
            <span class="label">{{ msg.role === "user" ? "我" : "AI" }}</span>
            <p>{{ msg.content }}</p>
          </div>
        </div>
        <div v-if="waitingFirstToken" class="message ai">
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
import { http, unwrapResult } from "../api/request";
import { Close } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

export default {
  components: { Close },
  data() {
    return {
      sessions: [], // 所有会话 [{id, title, messages}]
      chatId: "", // 当前激活的会话ID
      inputMessage: "",
      loading: false,
    };
  },
  async created() {
    await this.loadSessions();
    if (this.sessions.length) await this.switchSession(this.sessions[0].id);
    else await this.newChat();
  },

  computed: {
    // 当前会话的消息
    messages() {
      const s = this.sessions.find((s) => s.id === this.chatId);
      return s ? s.messages : [];
    },
    // 当前会话标题
    currentTitle() {
      const s = this.sessions.find((s) => s.id === this.chatId);
      return s ? s.title : "AI 助手";
    },
    // 还没收到第一个 token 时才显示"思考中..."
    waitingFirstToken() {
      if (!this.loading) return false;
      const list = this.messages;
      const last = list[list.length - 1];
      return !last || last.role !== "ai" || !last.content;
    },
  },

  methods: {
    async loadSessions() {
      try {
        const data = unwrapResult(await http.get("/api/chat_history/sessions"));
        this.sessions = data.map((session) => ({ ...session, messages: [] }));
      } catch (error) {
        ElMessage.error(error.response?.data?.msg || error.message || "加载会话失败");
      }
    },
    async newChat() {
      try {
        const session = unwrapResult(
          await http.post("/api/chat_history/sessions", { title: "新会话" })
        );
        this.sessions.unshift(session);
        this.chatId = session.id;
        this.scrollToBottom();
      } catch (error) {
        ElMessage.error(error.response?.data?.msg || error.message || "创建会话失败");
      }
    },
    async switchSession(id) {
      this.chatId = id;
      try {
        const session = unwrapResult(await http.get(`/api/chat_history/sessions/${id}`));
        const localSession = this.sessions.find((item) => item.id === id);
        if (localSession) {
          localSession.title = session.title;
          localSession.messages = session.messages;
        }
      } catch (error) {
        ElMessage.error(error.response?.data?.msg || error.message || "加载聊天记录失败");
      }
      this.scrollToBottom();
    },
    async deleteSession(index) {
      const removed = this.sessions[index];
      if (!removed) return;
      try {
        unwrapResult(await http.delete(`/api/chat_history/sessions/${removed.id}`));
        this.sessions.splice(index, 1);
        if (removed.id === this.chatId) {
          if (this.sessions.length) await this.switchSession(this.sessions[0].id);
          else await this.newChat();
        }
      } catch (error) {
        ElMessage.error(error.response?.data?.msg || error.message || "删除会话失败");
      }
    },
    // 用第一条用户消息作为会话标题
    updateTitle(firstUserMsg) {
      const s = this.sessions.find((s) => s.id === this.chatId);
      if (s && s.title === "新会话") s.title = firstUserMsg.slice(0, 32);
    },
    async sendMessage() {
      const msg = this.inputMessage.trim();
      if (!msg || this.loading) return;
      const session = this.sessions.find((s) => s.id === this.chatId);
      if (!session) return;

      if (session.title === "新会话") {
        session.title = msg.slice(0, 12) + (msg.length > 12 ? "..." : "");
      }

      session.messages.push({ role: "user", content: msg });
      session.messages.push({ role: "ai", content: "" });
      // 注意：必须通过响应式代理(session.messages[i])写入。
      // 直接改 push 进去的那个原始对象，Vue 不会重新渲染，流式文本就只会卡在"思考中"
      const aiIndex = session.messages.length - 1;
      const aiContent = () => session.messages[aiIndex]?.content || "";
      const setAiContent = (text) => {
        const target = session.messages[aiIndex];
        if (target) target.content = text;
      };
      const appendAiContent = (text) => {
        const target = session.messages[aiIndex];
        if (target) target.content += text;
        this.scrollToBottom();
      };
      this.inputMessage = "";
      this.loading = true;
      this.scrollToBottom();

      try {
        const token = localStorage.getItem("authToken");
        const response = await fetch(http.defaults.baseURL + "/api/ai/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: msg, chatId: this.chatId }),
        });

        // fetch 不走 axios 拦截器，token 轮换和 401 要自己处理
        const rotated = response.headers.get("authorization");
        if (rotated)
          localStorage.setItem("authToken", rotated.replace(/^Bearer\s+/i, ""));

        if (!response.ok) {
          const retryAfter = response.headers.get("retry-after");
          const data = await response.json().catch(() => null);
          if (response.status === 429) {
            setAiContent(
              retryAfter
                ? `请求过于频繁，请 ${retryAfter} 秒后重试`
                : "请求过于频繁，请稍后重试"
            );
          } else if (response.status === 401) {
            window.dispatchEvent(new CustomEvent("auth-expired"));
            setAiContent("❌ 未登录或登录已过期");
          } else {
            setAiContent("❌ " + (data?.msg || response.status));
          }
          return;
        }

        // 全局异常处理器会把错误包成 HTTP 200 的 JSON，这里必须校验内容类型
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await response.json().catch(() => null);
          setAiContent("❌ " + (data?.msg || "接口返回异常"));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let dataLines = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // 半行留到下一批
          for (const line of lines) {
            const trimmed = line.replace(/\r$/, "");
            if (trimmed.startsWith("data:")) {
              dataLines.push(trimmed.slice(5));
            } else if (trimmed === "" && dataLines.length) {
              appendAiContent(dataLines.join("\n")); // 一个事件结束才拼接
              dataLines = [];
            }
          }
        }
        if (buffer.startsWith("data:")) appendAiContent(buffer.slice(5));
        if (dataLines.length) appendAiContent(dataLines.join("\n"));
        if (!aiContent()) {
          setAiContent("❌ 流已结束但没有收到内容，请看后端控制台日志");
        }
      } catch (err) {
        if (!aiContent()) setAiContent("❌ 请求失败：" + err.message);
      } finally {
        this.loading = false;
        this.scrollToBottom();
      }
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.messageList;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  },
};
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
.session-item:hover {
  background: #374151;
}
.session-item.active {
  background: #409eff;
  color: white;
}
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
.session-item:hover .delete-icon {
  opacity: 1;
}

/* ===== 右侧聊天区 ===== */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
}
.header h2 {
  margin: 0 0 10px;
}
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
.message {
  margin-bottom: 12px;
  display: flex;
}
.message.user {
  justify-content: flex-end;
}
.bubble {
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.message.user .bubble {
  background: #409eff;
  color: white;
}
.label {
  font-size: 12px;
  opacity: 0.7;
}
.bubble p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
.input-area {
  display: flex;
  gap: 10px;
  padding-top: 10px;
  align-items: center;
}
.input-area .el-input {
  flex: 1;
}
</style>
