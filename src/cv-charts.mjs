// On-screen rendering of the same chart models the PDF draws.
//
// These are plain elements rather than SVG or a charting library: they reflow
// on a phone, print from the fallback path, and need nothing loaded over the
// network. The PDF remains the typeset artefact; this is the preview of it.

import { PALETTE } from './cv-metrics.mjs';
import { html } from './cv-html.mjs';

const tint = name => PALETTE[name] || PALETTE.primary;
const pct = value => `${(Math.max(0, Math.min(1, value)) * 100).toFixed(2)}%`;

const legend = items => `<div class="cv-chart-legend">${items.map(item =>
  `<span><i style="background:${tint(item.color)}"></i>${html(item.label)}</span>`).join('')}</div>`;

const frame = (chart, body, note) => `<figure class="cv-chart" data-chart="${html(chart.id)}">
  <figcaption>${html(chart.title)}</figcaption>
  ${body}
  ${note ? `<p class="cv-chart-note">${html(note)}</p>` : ''}
</figure>`;

function trend(chart) {
  const columns = chart.rows.map(row => {
    const total = row.parts.reduce((sum, part) => sum + part.value, 0);
    const segments = row.parts.filter(part => part.value > 0).map(part =>
      `<span class="cv-trend-part" style="height:${pct(part.value / chart.max)};background:${tint(part.color)}" title="${html(part.label)}: ${part.value}"></span>`).join('');
    return `<div class="cv-trend-col">
      <div class="cv-trend-stack" role="img" aria-label="${html(row.label)}: ${total}">${segments}</div>
      <span class="cv-trend-label">${html(row.label)}</span>
    </div>`;
  }).join('');
  return frame(chart, `<div class="cv-trend">${columns}</div>${legend(chart.legend)}`, chart.note);
}

function split(chart) {
  const bar = chart.slices.map(slice =>
    `<span style="width:${pct(slice.share)};background:${tint(slice.color)}" title="${html(slice.label)}: ${slice.value}"></span>`).join('');
  const items = chart.slices.map(slice => ({ ...slice, label: `${slice.label} (${slice.value.toLocaleString('ar-SA')})` }));
  return frame(chart, `<div class="cv-split">${bar}</div>${legend(items)}`,
    `الإجمالي: ${chart.total.toLocaleString('ar-SA')} ${chart.totalLabel}.`);
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

const RENDERERS = { 'stacked-bars': trend, split, bars, timeline };

export function renderCvCharts(charts) {
  const rendered = (charts || []).map(chart => RENDERERS[chart.kind]?.(chart) || '').filter(Boolean);
  return rendered.length ? `<div class="cv-chart-grid">${rendered.join('')}</div>` : '';
}
