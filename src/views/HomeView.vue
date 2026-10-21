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
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #f5f7fa;
}
.home-actions { position: absolute; top: 24px; right: 32px; display: flex; align-items: center; gap: 12px; }
.cards { display: flex; gap: 40px; margin-top: 30px; }
.card {
  width: 260px;
  padding: 40px 30px;
  background: white;
  border-radius: 16px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0,0,0,.08);
  transition: transform .2s, box-shadow .2s;
}
.card:hover {
  transform: translateY(-6px);
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
}
.icon { font-size: 48px; }
.card h3 { margin: 16px 0 8px; }
.card p { color: #909399; font-size: 14px; }
</style>
