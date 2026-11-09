import { render } from 'preact';
import { Options } from '../../options/Options.tsx';
import { followChromeTheme } from '../../ui/chrome-theme.ts';
import '../../options/options.css';

followChromeTheme();
render(<Options />, document.body);
