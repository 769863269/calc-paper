<template>
  <!-- 简易图表：数据解析与 SVG 坐标全在组件内算，父组件只传开关、输入串与图表类型 -->
  <transition name="fade">
    <div v-if="open" class="modal-mask" @click.self="$emit('close')">
      <div class="modal-card chart-card">
        <div class="chart-head">
          <span class="chart-title">简易图表</span>
          <div class="chart-tabs">
            <button :class="{ active: type === 'bar' }" @click="$emit('update:type', 'bar')">柱状图</button>
            <button :class="{ active: type === 'line' }" @click="$emit('update:type', 'line')">折线图</button>
          </div>
          <button class="chart-close" @click="$emit('close')" aria-label="关闭">×</button>
        </div>
        <div class="chart-input-row">
          <textarea
            :value="input" @input="$emit('update:input', $event.target.value)"
            class="chart-input mono-textarea"
            rows="2"
            placeholder="输入数据：12, 30, 25, 40　或　一月:12, 二月:30, 三月:25"
            spellcheck="false"
          ></textarea>
        </div>
        <div class="chart-canvas">
          <svg v-if="points.length" :viewBox="svg.viewBox" class="chart-svg" preserveAspectRatio="xMidYMid meet">
            <!-- 网格 + 坐标轴 -->
            <line v-for="(g, i) in svg.gridY" :key="'gy' + i" :x1="g.x1" :y1="g.y1" :x2="g.x2" :y2="g.y2" class="chart-grid" />
            <line :x1="svg.axis.x" :y1="svg.axis.y1" :x2="svg.axis.x" :y2="svg.axis.y2" class="chart-axis" />
            <line :x1="svg.axis.x" :y1="svg.axis.y2" :x2="svg.axis.x2" :y2="svg.axis.y2" class="chart-axis" />
            <!-- 柱状 -->
            <template v-if="type === 'bar'">
              <rect
                v-for="(p, i) in points"
                :key="'bar' + i"
                :x="p.bx"
                :y="p.y"
                :width="p.bw"
                :height="svg.plotH - p.y + svg.padT"
                rx="3"
                class="chart-bar"
              />
            </template>
            <!-- 折线 -->
            <template v-else>
              <polyline :points="points.map(p => p.x + ',' + p.y).join(' ')" class="chart-line" />
              <circle v-for="(p, i) in points" :key="'pt' + i" :cx="p.x" :cy="p.y" r="3.5" class="chart-dot" />
            </template>
            <!-- 数值标签 -->
            <text v-for="(p, i) in points" :key="'lb' + i" :x="p.x" :y="p.y - 8" class="chart-val">{{ p.label }}</text>
            <!-- X 轴标签 -->
            <text v-for="(p, i) in points" :key="'xl' + i" :x="p.x" :y="svg.axis.y2 + 16" class="chart-xlabel">{{ p.name }}</text>
          </svg>
          <p v-else class="chart-empty">输入数据后自动出图</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { parseChartInput } from '../core.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  input: { type: String, default: '' },
  type: { type: String, default: 'bar' }
})
defineEmits(['close', 'update:input', 'update:type'])

// 解析输入：支持 "12,30" 或 "一月:12, 二月:30"（纯解析逻辑在 core.parseChartInput）
const data = computed(() => parseChartInput(props.input))
const svg = computed(() => {
  const d = data.value
  const W = 560, H = 300, padL = 44, padR = 24, padT = 20, padB = 40
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxV = Math.max(1, ...d.map((x) => x.value))
  const minV = Math.min(0, ...d.map((x) => x.value))
  const range = maxV - minV || 1
  const yOf = (v) => padT + plotH * (1 - (v - minV) / range)
  const points = d.map((x, i) => {
    const xv = d.length === 1 ? padL + plotW / 2 : padL + plotW * i / (d.length - 1)
    const yv = yOf(x.value)
    const bw = d.length > 1 ? Math.min(40, plotW / d.length * 0.6) : 40
    return { name: x.name, label: String(x.value), x: xv, y: yv, bw, bx: xv - bw / 2 }
  })
  const gridY = []
  const ticks = 4
  for (let k = 0; k <= ticks; k++) {
    gridY.push({ x1: padL, y1: padT + plotH * k / ticks, x2: W - padR, y2: padT + plotH * k / ticks })
  }
  return {
    viewBox: `0 0 ${W} ${H}`,
    plotH,
    padT,
    axis: { x: padL, y1: padT, y2: padT + plotH, x2: W - padR },
    gridY,
    points
  }
})
const points = computed(() => svg.value.points)
</script>
