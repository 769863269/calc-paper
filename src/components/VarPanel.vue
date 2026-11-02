<template>
  <!-- 变量面板：只渲染传入的变量列表，改值/复制通过事件回给父组件 -->
    <div v-if="open" class="var-mask" @click="$emit('close')"></div>
    <transition name="slide-right">
      <aside v-if="open" class="var-panel" v-dialog="'变量面板'" @click.stop>
        <div class="var-panel-head">
          <div>
            <span class="var-panel-title">变量面板</span>
            <span class="var-panel-sub">所有稿纸共享 · 改值即重算</span>
          </div>
          <button class="var-panel-close" @click="$emit('close')" aria-label="关闭">×</button>
        </div>
        <div class="var-panel-body">
          <p class="var-panel-hint" v-if="!entries.length">还没有变量。<br/>在任意稿纸里用 <code>name = 值</code> 定义，例如 <code>tax = 0.13</code>，所有稿纸共享。</p>
          <div v-for="v in entries" :key="v.name" class="var-row">
            <span class="var-name">{{ v.name }}</span>
            <span class="var-eq">=</span>
            <input
              class="var-input"
              :value="drafts[v.name] ?? v.raw"
              @input="$emit('draft', v.name, $event)"
              @change="$emit('commit', v.name)"
              @keyup.enter="e => e.target.blur()"
              title="修改后实时重算全部稿纸"
              spellcheck="false"
            />
            <button class="var-copy" @click="$emit('copy', v.name, v.raw)" title="复制值">⧉</button>
          </div>
        </div>
      </aside>
    </transition>
</template>

<script setup>
import { dialogDirective } from '../a11y.js'

const vDialog = dialogDirective()
defineProps({
  open: { type: Boolean, default: false },
  entries: { type: Array, default: () => [] },
  drafts: { type: Object, default: () => ({}) }
})
defineEmits(['close', 'draft', 'commit', 'copy'])
</script>
