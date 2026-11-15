<template>
  <div class="home">
    <div class="home-actions">
      <span v-if="user">欢迎，{{ user.username }}</span>
      <el-button v-if="user" @click="$emit('logout')">退出登录</el-button>
      <template v-else>
        <el-button @click="$emit('login', 'login')">登录</el-button>
        <el-button type="primary" @click="$emit('login', 'register')">注册</el-button>
      </template>
    </div>

    <h1>🎮 选择模式</h1>

    <div class="cards">
      <div class="card" @click="$emit('select', 'chat')">
        <div class="icon">💬</div>
        <h3>AI 聊天</h3>
        <p>和"张德帅"自由对话，支持多会话记忆</p>
      </div>
      <div class="card" @click="$emit('select', 'soup')">
        <div class="icon">🐢</div>
        <h3>海龟汤模拟器</h3>
        <p>提问还原真相，考验你的推理能力</p>
      </div>
      <div class="card" @click="$emit('select', 'kb')">
        <div class="icon">📚</div>
        <h3>文档问答</h3>
        <p>上传文档，基于内容智能问答，回答带引用出处</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: { user: { type: Object, default: null } },
  emits: ['select', 'login', 'logout']
}
</script>

<style scoped>
.home {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: var(--space-6);
  box-sizing: border-box;
  background: var(--bg-page);
}

.home-actions {
  position: absolute;
  top: var(--space-5);
  right: var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-3);
  font-size: 14px;
}

.home h1 {
  margin: 0 0 var(--space-6);
  font-size: 24px;
  letter-spacing: .5px;
}

/* 三张卡片：用 grid + auto-fit，窄屏自动换行，不再写死宽度 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 280px));
  justify-content: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 960px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-6) var(--space-5);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: center;
  cursor: pointer;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-light);
}

.icon {
  font-size: 40px;
  line-height: 1;
}

.card h3 {
  margin: var(--space-4) 0 var(--space-2);
  font-size: 16px;
}

.card p {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.6;
}
</style>