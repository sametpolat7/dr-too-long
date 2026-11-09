import { render } from 'preact';
import { Popup } from '../../popup/Popup.tsx';
import { followChromeTheme } from '../../ui/chrome-theme.ts';
import '../../popup/popup.css';

followChromeTheme();
render(<Popup />, document.body);
