import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#1A2744',
          secondary: '#C09840',
          background: '#F7F4EF',
          surface: '#FFFFFF',
          error: '#D32F2F',
          success: '#388E3C',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg', elevation: 0 },
    VCard: { rounded: 'lg', elevation: 0 },
    VTextField: { rounded: 'lg' },
  },
});
