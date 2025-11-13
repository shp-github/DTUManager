<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ msg: string }>()

const count = ref(0)
</script>

<template>
  <div class="container">
    <h1 class="title">{{ msg }}</h1>

    <div class="card">
      <button type="button" class="btn" @click="count++">
        count is {{ count }}
      </button>
      <p class="hint">
        Edit <code>components/HelloWorld.vue</code> to test HMR
      </p>
    </div>

    <div class="links">
      <p>
        Check out
        <a href="https://vuejs.org/guide/quick-start.html#local" target="_blank">Vue Guide</a>
      </p>
      <p>
        Install
        <a href="https://github.com/johnsoncodehk/volar" target="_blank">Volar</a>
        in your IDE for a better DX
      </p>
    </div>

    <p class="footer">Click on the Vite and Vue logos to learn more</p>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  font-family: 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #ece9e6, #ffffff);
  min-height: 100vh;
}

.title {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 30px;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
}

.card {
  background: #fff;
  padding: 30px 40px;
  border-radius: 15px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
}

.btn {
  padding: 12px 25px;
  font-size: 1.1rem;
  border: none;
  border-radius: 50px;
  background: linear-gradient(90deg, #409EFF, #66b1ff);
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 15px;
}
.btn:hover {
  transform: scale(1.1);
  box-shadow: 0 5px 15px rgba(64,158,255,0.4);
}

.hint {
  font-size: 0.9rem;
  color: #666;
}

.links a {
  color: #409EFF;
  text-decoration: none;
  font-weight: 500;
}
.links a:hover {
  text-decoration: underline;
}

.footer {
  margin-top: 50px;
  color: #999;
  font-size: 0.85rem;
}
</style>
