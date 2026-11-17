// "Support the author" block for Settings: text, a button that opens the donation page and a QR code for phones.
import { openUrl } from '../actions';
import { h, svg } from '../dom';
import { icons } from '../icons';
import { t } from '../i18n';

export const SUPPORT_URL = 'https://donatello.to/MicsGame';

export function supportSection(): HTMLElement[] {
  return [
    h('h3', { class: 'caps' }, t('support.title')),
    h('div', { class: 'set-card' },
      h('div', { class: 'set-row support-row' },
        h('div', { class: 'set-text' },
          h('div', { class: 'hint' }, t('support.text')),
          h('button', { class: 'btn primary small support-btn', onclick: () => void openUrl(SUPPORT_URL) }, svg(icons.external), t('support.button')),
        ),
        h('figure', { class: 'support-qr' },
          h('img', { src: './support-qr.png', width: 128, height: 128, alt: SUPPORT_URL }),
          h('figcaption', null, t('support.scan')),
        ),
      ),
    ),
  ];
}
