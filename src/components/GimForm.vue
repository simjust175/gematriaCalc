<template>
  <v-card class="pa-5 py-8 rashi bg-grey-lighten-2" min-width="600">
    <v-locale-provider rtl>
      <v-text-field
        label="Enter gematria"
        variant="outlined"
        class="text-h2 text-h4 py-4"
        :class="{'rashi': rashiStat}"
        v-model="gimatria"
        :loading="loading"
        :rules="gimatriaRules"
        clearable
      ></v-text-field>
    <v-row>
      <v-col cols="6">
        <v-card variant="outlined" cols="5" min-height="150">
          <v-card-title class="pr-4 text-h6">גימטריה:</v-card-title>
          <div class="pa-8 pt-1 pl-1 d-flex align-center justify-center">
            <h2 class="text-center">{{ gimatriaCalc("full") }}</h2>
          </div>
        </v-card>
      </v-col>
      <v-col cols="6">
        <v-card variant="outlined" cols="5" min-height="150">
          <v-card-title class="pr-4 text-h6">מספר קטן:</v-card-title>
          <div class="pa-8 pt-1 pl-1 d-flex align-center justify-center">
            <h2 class="text-center">{{ gimatriaCalc("short") }}</h2>
          </div>
        </v-card>
      </v-col>
    </v-row>
    
</v-locale-provider>
  </v-card>
</template>

<script setup>
import { reactive, ref } from "vue";
const props  = defineProps({ rashiStat: Boolean})
const gimatria = ref("");

const gimatriaRules = ref([
  (value) => {
    if (!value) return true;
    for (let char of value) {
      if (char !== " " && !gimatriaValues[char]) {
        return "Oy vey! Only alef-bais will work.";
      }
    }
    return true;
  },
]);

const gimatriaValues = reactive({
  א: { full: 1, short: 1 },
  ב: { full: 2, short: 2 },
  ג: { full: 3, short: 3 },
  ד: { full: 4, short: 4 },
  ה: { full: 5, short: 5 },
  ו: { full: 6, short: 6 },
  ז: { full: 7, short: 7 },
  ח: { full: 8, short: 8 },
  ט: { full: 9, short: 9 },
  י: { full: 10, short: 1 },
  כ: { full: 20, short: 2 },
  ך: { full: 20, short: 2 },
  ל: { full: 30, short: 3 },
  מ: { full: 40, short: 4 },
  ם: { full: 40, short: 4 },
  נ: { full: 50, short: 5 },
  ן: { full: 50, short: 5 },
  ס: { full: 60, short: 6 },
  ע: { full: 70, short: 7 },
  פ: { full: 80, short: 8 },
  ף: { full: 80, short: 8 },
  צ: { full: 90, short: 9 },
  ץ: { full: 90, short: 9 },
  ק: { full: 100, short: 1 },
  ר: { full: 200, short: 2 },
  ש: { full: 300, short: 3 },
  ת: { full: 400, short: 4 },
});

const loading = ref(false);
const setLoading = () => {
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
  }, 1500);
};

const gimatriaCalc = (stat) => {
  const gim = gimatria.value.trim();
  if (!gim) return null;
  setLoading()
  const gimatriaArray = gim.split("").filter((char) => gimatriaValues[char]);
  const array = gimatriaArray.map((char) => gimatriaValues[char][stat]);
  return array.reduce((total, value) => total + value, 0);
};
</script>

<style>
.text-h4 input {
  font-size: 1.8rem; /* Adjust the font size as needed */
}
</style>
