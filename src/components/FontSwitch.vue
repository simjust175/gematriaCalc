<template>
    <div class="container pr-4">
      <label class="language-switcher">
        <input type="checkbox">
        <span class="slider round pr-1"></span>
        <span class="select-fr rashi pl-1" @click="$emit('fontChange', true)">רשי</span>
        <span class="select-en" @click="$emit('fontChange', false)">כתיב</span>
      </label>
    </div>
  </template>
  
  <script>
  export default {
  
  }
  </script>
  
  <style scoped>
  @import url(https://fonts.googleapis.com/css?family=Source+Sans+Pro:400,400i,700,700i);
  
  .container {
    /* background-color: var(--bg);
    --bg: #00a6eb; */
    margin: 0;
    padding: 0;
    height: 40px;
    font-family: "Source Sans Pro", Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .language-switcher {
    position: relative;
    display: inline-block;
    width: 80px; /* Adjusted width */
    height: 40px; /* Adjusted height */
    transition: transform 0.17s cubic-bezier(0.26, 0.48, 0.08, 0.9);
  }
  
  .language-switcher input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .language-switcher .select-fr,
  .language-switcher .select-en {
    position: absolute;
    font-size: 14px; /* Adjusted font size */
    top: 50%;
    transform: translateY(-50%);
    color: #fff;
    mix-blend-mode: difference;
  }
  
  .language-switcher .select-fr {
    left: 8px; /* Adjusted position */
  }
  
  .language-switcher .select-en {
    right: 8px; /* Adjusted position */
  }
  
  /* The slider */
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #1e3470;
    box-shadow: 0 3px 64px rgba(30, 52, 112, 0.1);
    transition: 0.4s;
  }
  
  .slider:before {
    position: absolute;
    content: "";
    height: 40px; /* Adjusted height */
    width: 40px; /* Adjusted width */
    left: 0;
    bottom: 0;
    background-color: white;
    box-shadow: 0 3px 64px rgba(30, 52, 112, 0.16);
    transition: 0.4s;
  }
  
  input:checked + .slider {
    background-color: #1e3470;
  }
  
  input:focus + .slider {
    box-shadow: none;
  }
  
  input:checked + .slider:before {
    transform: translateX(40px); /* Adjusted translation */
  }
  
  /* Rounded sliders */
  .slider.round {
    border-radius: 40px; /* Adjusted border radius */
  }
  
  .slider.round:before {
    border-radius: 50%;
  }
  </style>
  