<template>
  <!-- 汇率说明卡片：数据由父组件抓取后传入，这里只负责展示与倒计时文案 -->
  <transition name="fade">
    <div v-if="card" class="rate-mask" v-dialog="'参考汇率'" @click.self="$emit('close')">
      <div class="rate-card">
        <div class="rate-progress"></div>
        <div class="rate-header">
          <div class="rate-title">
            <span class="rate-flag">$</span>
            <span>参考汇率</span>
          </div>
          <button class="rate-close" @click="$emit('close')" aria-label="关闭">×</button>
        </div>

        <div class="rate-hero">
          <div class="rate-pair">USD → CNY</div>
          <div class="rate-value">
            <span class="rate-unit">1 美元 =</span>
            <span class="rate-number">{{ card.rate }}</span>
            <span class="rate-unit">元</span>
          </div>
        </div>

        <div class="rate-meta">
          <div class="rate-meta-row">
            <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke-linecap="round"/></svg>
            <div class="rate-meta-item">
              <span class="rate-meta-label">更新时间</span>
              <span class="rate-meta-value">{{ fmtRateTime(card.time) }}</span>
            </div>
          </div>
          <div class="rate-meta-row">
            <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2" stroke-linecap="round"/></svg>
            <div class="rate-meta-item">
              <span class="rate-meta-label">下次更新</span>
              <span class="rate-meta-value">{{ fmtRateTime(card.nextUpdate) }}</span>
            </div>
          </div>
          <div class="rate-meta-row">
            <svg class="rate-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div class="rate-meta-item">
              <span class="rate-meta-label">数据来源</span>
              <span class="rate-meta-value">{{ card.source }}</span>
            </div>
          </div>
        </div>

        <p class="rate-note">
          取各大央行参考汇率，每日更新一次，非实时盘面报价，仅供换算参考。实际结汇请以银行实时牌价为准。
        </p>

        <div v-if="card.filled" class="rate-filled-hint">
          <svg class="rate-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          已自动填入底部公式框
        </div>

        <div class="rate-footer">
          <span class="rate-count">{{ countdown }} 秒后自动关闭</span>
          <button class="rate-btn-single" @click="$emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { fmtRateTime } from '../rate.js'
import { dialogDirective } from '../a11y.js'

const vDialog = dialogDirective()

defineProps({
  card: { type: Object, default: null },
  countdown: { type: Number, default: 0 }
})
defineEmits(['close'])
</script>
