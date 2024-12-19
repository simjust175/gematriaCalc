<template>
  <div>
    <v-app class="bg-alef-beis" theme="light" id="app">
      <v-app-bar scroll-behavior="elevate inverted" class="bg-grey-lighten-2 mr-10" height="45">
        <v-toolbar-title>
          <v-img src="../public/images/gemariaLogo.png" max-width="40"></v-img>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        
      </v-app-bar>
      <v-main class="d-flex align-center justify-center">
        <gim-form />
      </v-main>
    </v-app>
  </div>
</template>

<script>
export default {
  name: 'app'
}
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Audiowide&family=Berkshire+Swash&family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Dancing+Script:wght@400;500;700&family=Happy+Monkey&family=Noto+Rashi+Hebrew:wght@100..900&display=swap');

.rashi {
  font-family: "Noto Rashi Hebrew", serif;
}

#app {
  background: url("../public/images/alef_beis.png") no-repeat center center fixed !important;
  background-size: cover;
}
</style>
