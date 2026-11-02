// Opt-in fixture instrumentation. It observes real pointer drags without changing the app.
let frame = 0;
let record = null;
const output = document.createElement('output');
output.id = 'queue-drag-observations';
output.hidden = true;
document.body.append(output);
const rect = (node) => {
  const bounds = node.getBoundingClientRect();
  return { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height };
};
function publish() { output.textContent = JSON.stringify(record); }
function sample() {
  const preview = document.querySelector('.queue-drag-preview');
  const placeholder = document.querySelector('.queue-drop-placeholder');
  const list = document.querySelector('[data-queue-list="upcoming"]');
  if (preview && placeholder && list && record.samples.length < 120) {
    record.samples.push({ preview: rect(preview), text: preview.textContent, artwork: !!preview.querySelector('.artwork'), trackWidth: rect(preview.querySelector('.queue-track')).width, textWidth: rect(preview.querySelector('.queue-track > span')).width, placeholder: rect(placeholder), listHeight: list.getBoundingClientRect().height });
    publish();
  }
  frame = requestAnimationFrame(sample);
}
document.addEventListener('pointerdown', (event) => {
  const row = event.target.closest('[data-queue-list="upcoming"] [data-queue-index]');
  if (!row || event.target.closest('.queue-remove')) return;
  cancelAnimationFrame(frame);
  record = { origin: rect(row), trackWidth: rect(row.querySelector('.queue-track')).width, textWidth: rect(row.querySelector('.queue-track > span')).width, id: row.dataset.upcomingId, listHeight: row.parentElement.getBoundingClientRect().height, samples: [] };
  publish();
  frame = requestAnimationFrame(sample);
}, true);
document.addEventListener('pointerup', () => {
  if (!record) return;
  cancelAnimationFrame(frame);
  publish();
}, true);
