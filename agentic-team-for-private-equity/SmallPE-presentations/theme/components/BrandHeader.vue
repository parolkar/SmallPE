<script setup lang="ts">
// Use Vite asset handling to ensure images are bundled
// Two variants to fit light/dark backgrounds
// These files will be copied into assets/logo/
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import logoLight from '../assets/logo/logo-wordmark-primary-tight-light.svg?url'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import logoDark from '../assets/logo/logo-wordmark-primary-tight-dark.svg?url'
</script>

<template>
  <div class="inloop-header">
    <img :src="logoLight" alt="Inloop" class="logo-light" />
    <img :src="logoDark" alt="Inloop" class="logo-dark" />
  </div>
  
</template>

