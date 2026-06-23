import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import { tooltip } from "./directives/tooltip";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.directive("tooltip", tooltip);
app.mount("#app");
