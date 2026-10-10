import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import { readData, loadCsv } from './site-data.mjs';
import { createActivityReader } from './activity-data.mjs';

window.Chart = Chart;
window.Papa = Papa;
window.SiteData = { readData, loadCsv, loadActivity: createActivityReader({ readData, sourceId: __ACTIVITY_SOURCE_ID__ }) };
