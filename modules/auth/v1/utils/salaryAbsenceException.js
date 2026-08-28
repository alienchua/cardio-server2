const errorWithStatus = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeAbsenceExceptionInput = (input = {}) => {
  const month = String(input.month || '').trim();
  const staffNo = Number(input.staff_no);
  const hasWaiveDecision = input.waive_deduction === true
    || input.waive_deduction === false
    || input.waive_deduction === 1
    || input.waive_deduction === 0;
  const waiveDeduction = input.waive_deduction === true || input.waive_deduction === 1;
  const specialRemark = String(input.special_remark || '').trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw errorWithStatus('A valid month in YYYY-MM format is required');
  }
  if (!Number.isInteger(staffNo) || staffNo <= 0) {
    throw errorWithStatus('A valid staff number is required');
  }
  if (!hasWaiveDecision) {
    throw errorWithStatus('waive_deduction must be true or false');
  }
  if (specialRemark.length > 1000) {
    throw errorWithStatus('Special Remark must be 1000 characters or fewer');
  }

  return {
    month,
    staff_no: staffNo,
    waive_deduction: waiveDeduction,
    special_remark: specialRemark
  };
};

module.exports = {
  errorWithStatus,
  normalizeAbsenceExceptionInput
};
