<template>
  <HomeView v-if="view === 'home'" @select="view = $event" />
  <ChatView v-else-if="view === 'chat'" @back="view = 'home'" />
  <SoupView v-else-if="view === 'soup'" @back="view = 'home'" />
</template>

<script>
import HomeView from './views/HomeView.vue'
import ChatView from './views/ChatView.vue'
import SoupView from './views/SoupView.vue'

export default {
  components: { HomeView, ChatView, SoupView },
  data() {
    return { view: 'home' }
  }
}
</script>
