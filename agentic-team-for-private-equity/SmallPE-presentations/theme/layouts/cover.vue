<script setup lang="ts">
import { computed } from 'vue'
import BrandHeader from '../components/BrandHeader.vue'
import { handleBackground } from '../layoutHelper'

const props = defineProps({
  background: {
    default: '',
  },
})

const style = computed(() => handleBackground(props.background, true))
</script>

<template>
  <div class="slidev-layout cover inloop-bg" :style="style">
    <BrandHeader />
    <div class="my-auto w-full">
      <slot />
    </div>
  </div>
</template>
