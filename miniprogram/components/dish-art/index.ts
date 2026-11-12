import { assetUrl } from '../../api/config';

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    imageKey: {
      type: String,
      value: ''
    },
    name: {
      type: String,
      value: ''
    }
  },
  data: {
    src: '',
    glyph: '菜',
    tone: 0
  },
  observers: {
    'imageKey, name'(imageKey: string, name: string) {
      let hash = 0;
      const text = name || '';
      for (let i = 0; i < text.length; i += 1) {
        hash = (hash + text.charCodeAt(i) * (i + 1)) % 4;
      }
      const chars = Array.from(text);
      this.setData({
        src: assetUrl(imageKey),
        glyph: chars.length ? chars[0] : '菜',
        tone: hash
      });
    }
  }
});
