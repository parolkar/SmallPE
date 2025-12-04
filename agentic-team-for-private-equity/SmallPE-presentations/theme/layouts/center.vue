<script setup lang="ts">
import BrandHeader from '../components/BrandHeader.vue'
</script>

<template>
  <div class="slidev-layout center inloop-bg h-full grid place-content-center">
    <BrandHeader />
    <div class="my-auto">
      <slot />
    </div>
  </div>
</template>
