const hasAssignedBayStaff = (bayStaff) => (
  Array.isArray(bayStaff) && bayStaff.some((staff) => staff?.staff_id != null)
);

const canCheckInToBay = (bayName, bayStaff) => (
  String(bayName || '').trim().toUpperCase() === 'E1' || hasAssignedBayStaff(bayStaff)
);

module.exports = { hasAssignedBayStaff, canCheckInToBay };
