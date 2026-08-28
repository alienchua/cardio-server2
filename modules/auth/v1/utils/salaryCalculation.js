const asMoney = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
};

const isActiveAbsenceException = (exception) => (
  Boolean(exception)
  && String(exception.status || '').toLowerCase() === 'active'
  && exception.waive_deduction === true
);

const getDeductibleAbsentDays = (absent, exception) => {
  const absentDays = Math.max(0, Number(absent || 0));
  return isActiveAbsenceException(exception) ? 0 : absentDays;
};

const getAttendanceAbsenteeism = (production, absent, exception = null) => {
  const absentDays = getDeductibleAbsentDays(absent, exception);
  const productionAmount = asMoney(production);
  if (absentDays > 0 && absentDays <= 2) return asMoney(productionAmount * 0.1);
  if (absentDays > 2 && absentDays <= 4) return asMoney(productionAmount * 0.2);
  if (absentDays > 4) return asMoney(productionAmount * 0.25);
  return 0;
};

module.exports = {
  asMoney,
  getAttendanceAbsenteeism,
  getDeductibleAbsentDays,
  isActiveAbsenceException
};
