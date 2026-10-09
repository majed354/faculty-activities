// On-screen rendering of the same chart models the PDF draws.
//
// These are plain elements rather than SVG or a charting library: they reflow
// on a phone, print from the fallback path, and need nothing loaded over the
// network. The PDF remains the typeset artefact; this is the preview of it.

import { html } from './cv-html.mjs';
import { PALETTE } from './cv-metrics.mjs';

const pct = value => `${(Math.max(0, Math.min(1, value)) * 100).toFixed(2)}%`;
const tint = name => PALETTE[name] || PALETTE.primary;

const frame = (chart, body, note) => `<figure class="cv-chart" data-chart="${html(chart.id)}">
  <figcaption>${html(chart.title)}</figcaption>
  ${body}
  ${note ? `<p class="cv-chart-note">${html(note)}</p>` : ''}
</figure>`;

function groupedBars(chart) {
  const groups = chart.groups.map(group => `<div class="cv-group">
    <span class="cv-group-label">${html(group.label)}</span>
    <div class="cv-group-bars">${group.bars.map(bar => `<div class="cv-bar-row">
      <span class="cv-bar-track"><span class="cv-bar-fill" style="width:${pct(Math.max(bar.value / chart.max, 0.03))};background:${tint(bar.color)}"></span></span>
      <span class="cv-bar-value" title="${html(bar.label)}">${bar.value.toLocaleString('ar-SA')}</span>
    </div>`).join('')}</div>
  </div>`).join('');
  const legend = `<div class="cv-chart-legend">${chart.legend.map(item =>
    `<span><i style="background:${tint(item.color)}"></i>${html(item.label)}</span>`).join('')}</div>`;
  return frame(chart, `<div class="cv-groups">${groups}</div>${legend}`, chart.note);
}

function bars(chart) {
  const rows = chart.rows.map(row => `<div class="cv-bar-row">
    <span class="cv-bar-label">${html(row.label)}</span>
    <span class="cv-bar-track"><span class="cv-bar-fill" style="width:${pct(Math.max(row.value / chart.max, 0.02))}"></span></span>
    <span class="cv-bar-value">${row.value.toLocaleString('ar-SA')} ${html(chart.unit || '')}</span>
  </div>`).join('');
  return frame(chart, `<div class="cv-bars">${rows}</div>`, chart.note);
}

function timeline(chart) {
  const events = chart.events.map(event => `<li>
    <span class="cv-timeline-year">${html(event.yearLabel)}</span>
    <span class="cv-timeline-body"><strong>${html(event.title)}</strong>${
      [event.detail, event.endLabel].filter(Boolean).length
        ? `<span>${html([event.detail, event.endLabel].filter(Boolean).join(' · '))}</span>` : ''
    }</span>
  </li>`).join('');
  return frame(chart, `<ol class="cv-timeline">${events}</ol>`, '');
}

const RENDERERS = { 'grouped-bars': groupedBars, bars, timeline };

export function renderCvCharts(charts) {
  const rendered = (charts || []).map(chart => RENDERERS[chart.kind]?.(chart) || '').filter(Boolean);
  return rendered.length ? `<div class="cv-chart-grid">${rendered.join('')}</div>` : '';
}
