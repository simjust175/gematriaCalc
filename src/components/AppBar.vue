<template>
   <v-app-bar scroll-behavior="elevate inverted" class="bg-grey-lighten-2 mr-10" height="50">
        <v-toolbar-title>
          <v-img src="../../public/images/gemariaLogo.png" max-width="40"></v-img>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <font-switch v-bind="$attrs"/>
      </v-app-bar>
</template>

<script>
import FontSwich from './FontSwitch.vue'
export default {
  components: { FontSwich },

}
</script>

<style>

</style>