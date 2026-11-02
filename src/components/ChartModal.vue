<template>
  <!-- 简易图表：数据解析与 SVG 坐标全在组件内算，父组件只传开关、输入串与图表类型 -->
  <transition name="fade">
    <div v-if="open" class="modal-mask" v-dialog="'简易图表'" @click.self="$emit('close')">
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
            <line :x1="svg.axis.x" :y1="svg.axis.top" :x2="svg.axis.x" :y2="svg.axis.bottom" class="chart-axis" />
            <line :x1="svg.axis.x" :y1="svg.axis.zero" :x2="svg.axis.x2" :y2="svg.axis.zero" class="chart-axis" />
            <!-- 柱状 -->
            <template v-if="type === 'bar'">
              <rect
                v-for="(p, i) in points"
                :key="'bar' + i"
                :x="p.bx"
                :y="p.barY"
                :width="p.bw"
                :height="p.barH"
                rx="3"
                class="chart-bar"
              />
            </template>
            <!-- 折线 -->
            <template v-else>
              <polyline :points="points.map(p => p.x + ',' + p.y).join(' ')" class="chart-line" />
              <circle v-for="(p, i) in points" :key="'pt' + i" :cx="p.x" :cy="p.y" r="3.5" class="chart-dot" />
            </template>
            <!-- 数值标签：负值放到柱体下方，避免压在柱子里 -->
            <text v-for="(p, i) in points" :key="'lb' + i" :x="p.x" :y="p.labelY" class="chart-val">{{ p.label }}</text>
            <!-- X 轴标签 -->
            <text v-for="(p, i) in points" :key="'xl' + i" :x="p.x" :y="svg.labelY" class="chart-xlabel">{{ p.name }}</text>
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
import { dialogDirective } from '../a11y.js'

const vDialog = dialogDirective()

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
  // 刻度范围必须包含 0：柱状图以 0 为基线，否则负值柱会画反（原来柱底固定在图底，
  // 于是 -5,-10,3 里最低那根高度为 0、完全看不见）。
  const maxV = Math.max(0, ...d.map((x) => x.value))
  const minV = Math.min(0, ...d.map((x) => x.value))
  const range = maxV - minV || 1
  const yOf = (v) => padT + plotH * (1 - (v - minV) / range)
  const zeroY = yOf(0) // 0 所在的高度，也就是柱子的基线
  const points = d.map((x, i) => {
    const xv = d.length === 1 ? padL + plotW / 2 : padL + plotW * i / (d.length - 1)
    const yv = yOf(x.value)
    const bw = d.length > 1 ? Math.min(40, plotW / d.length * 0.6) : 40
    const top = Math.min(yv, zeroY)
    // 值为 0 时柱高为 0，给 1px 让「有这么一根」还能看出来
    const h = Math.max(1, Math.abs(yv - zeroY))
    return {
      name: x.name, label: String(x.value), x: xv, y: yv, bw, bx: xv - bw / 2,
      barY: top, barH: h,
      labelY: x.value < 0 ? yv + 14 : top - 8
    }
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
    // zero 是横轴（0 基线）的位置，bottom 是绘图区底边：有负值时两者不再重合，
    // 横轴跟着 0 走，X 轴标签仍固定贴在底边，不会挤进图里
    axis: { x: padL, top: padT, bottom: padT + plotH, zero: zeroY, x2: W - padR },
    labelY: padT + plotH + 16,
    gridY,
    points
  }
})
const points = computed(() => svg.value.points)
</script>
