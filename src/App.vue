<template>
  <HomeView v-if="view === 'home'" :user="user" @select="selectMode" @login="openLogin" @logout="logout" />
  <ChatView v-else-if="view === 'chat'" @back="view = 'home'" />
  <SoupView v-else-if="view === 'soup'" @back="view = 'home'" />

  <el-dialog v-model="loginVisible" :title="authMode === 'login' ? '用户登录' : '用户注册'" width="380px" @closed="resetForm">
    <p class="auth-tip">登录后才能使用 AI 聊天和海龟汤功能。</p>
    <el-form ref="authForm" :model="form" :rules="rules" label-position="top" @keyup.enter="submitAuth">
      <el-form-item label="用户名" prop="username"><el-input v-model="form.username" autocomplete="username" /></el-form-item>
      <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" show-password autocomplete="current-password" /></el-form-item>
      <el-form-item v-if="authMode === 'register'" label="确认密码" prop="confirmPassword"><el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="authMode = authMode === 'login' ? 'register' : 'login'">{{ authMode === 'login' ? '去注册' : '返回登录' }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submitAuth">{{ authMode === 'login' ? '登录' : '注册并登录' }}</el-button>
    </template>
  </el-dialog>
</template>

<script>
import HomeView from './views/HomeView.vue'
import ChatView from './views/ChatView.vue'
import SoupView from './views/SoupView.vue'
import { clearAuth, readAuthUser, saveAuth, unwrapResult, userApi } from './api/request'
import { ElMessage, ElMessageBox } from 'element-plus'

export default {
  components: { HomeView, ChatView, SoupView },
  data() {
    return {
      view: 'home', user: readAuthUser(), loginVisible: false, authMode: 'login', submitting: false,
      form: { username: '', password: '', confirmPassword: '' },
      rules: {
        username: [{ required: true, message: '请输入用户名', trigger: 'blur' }, { min: 3, max: 64, message: '用户名长度为 3-64 个字符', trigger: 'blur' }],
        password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 8, message: '密码至少 8 个字符', trigger: 'blur' }],
        confirmPassword: [{ required: true, message: '请再次输入密码', trigger: 'blur' }, { validator: (rule, value, callback) => value === this.form.password ? callback() : callback(new Error('两次输入的密码不一致')), trigger: 'blur' }]
      }
    }
  },
  mounted() { window.addEventListener('auth-expired', this.handleAuthExpired) },
  beforeUnmount() { window.removeEventListener('auth-expired', this.handleAuthExpired) },
  methods: {
    selectMode(mode) {
      if (!this.user || !localStorage.getItem('authToken')) {
        ElMessageBox.alert('请先登录，否则无法正常使用游戏功能。', '需要登录', { confirmButtonText: '去登录', type: 'warning' }).then(() => this.openLogin()).catch(() => {})
        return
      }
      this.view = mode
    },
    openLogin(mode = 'login') { this.authMode = mode; this.loginVisible = true },
    async submitAuth() {
      if (this.submitting) return
      try {
        await this.$refs.authForm.validate()
        this.submitting = true
        const api = this.authMode === 'login' ? userApi.login : userApi.register
        const account = unwrapResult(await api({ username: this.form.username.trim(), password: this.form.password }))
        saveAuth(account)
        this.user = { id: account.id, username: account.username }
        this.loginVisible = false
        ElMessage.success(this.authMode === 'login' ? '登录成功' : '注册成功，已自动登录')
      } catch (error) {
        if (error !== false) ElMessage.error(error.response?.data?.msg || error.message || '认证失败')
      } finally { this.submitting = false }
    },
    logout() { clearAuth(); this.user = null; this.view = 'home'; ElMessage.success('已退出登录') },
    handleAuthExpired() { this.user = null; this.view = 'home'; ElMessage.warning('登录已过期，请重新登录'); this.openLogin() },
    resetForm() { this.form = { username: '', password: '', confirmPassword: '' }; this.$refs.authForm?.clearValidate() }
  }
}
</script>
