import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import { readData, loadCsv } from './site-data.mjs';

window.Chart = Chart;
window.Papa = Papa;
window.SiteData = { readData, loadCsv };
