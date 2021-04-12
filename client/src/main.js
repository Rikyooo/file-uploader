import Vue from 'vue'
import App from './App.vue'
import axios from 'axios'
import './plugins/element.js'

axios.defaults.baseURL = "/api";
axios.interceptors.response.use(
  async res => {
    const { data } = res;
    return data;
  }
);

Vue.prototype.$axios = axios;
Vue.config.productionTip = false;

new Vue({
  render: h => h(App),
}).$mount('#app')
