const { types } = require('pg');
const malaysiaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
const malaysiaTimestamp = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).format(date).replace(' ', 'T') + `.${String(date.getMilliseconds()).padStart(3, '0')}+08:00`;
const malaysiaInstant = (value) => value instanceof Date ? value : new Date(
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(String(value))
    ? `${String(value).replace(' ', 'T')}+08:00` : value
);
// Preserve timezone-free database values instead of letting the Node host timezone
// silently turn them into incorrect instants. QG/CA instants use explicit SQL zones.
const databaseTypes = {
  getTypeParser(oid, format) {
    if (format !== 'binary' && (oid === 1114 || oid === 1082)) return value => value;
    return types.getTypeParser(oid, format);
  }
};
module.exports = { malaysiaDate, malaysiaTimestamp, malaysiaInstant, databaseTypes };
