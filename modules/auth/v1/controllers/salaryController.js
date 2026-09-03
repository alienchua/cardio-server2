const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  insertInstallment,
  getInstallment,
  getInstallmentByNo,
  getSalaryResult,
  getSalaryDetail,
  getSalaryDetailByBay,
  insertSettlement,
  getSalaryMonthStatusData,
  getFinanceInputByStaff,
  getFinanceInputsForMonth,
  getSalarySnapshotByStaff,
  resolveStaffNo,
  upsertSalaryFinanceInputs,
  getSalaryBasePayRules,
  upsertSalaryBasePayRules,
  DEFAULT_BASE_PAY_RULES,
  insertAdjustment,
  getAdjustments,
  getAdjustmentByNo,
  updateAdjustment,
  cancelAdjustment,
  getAdjustmentsBySource,
  getAdjustmentMonths,
  getSettledMonths,
  getSalaryAdjustmentsForMonth
} = require('../models/salaryModel');
const { getStaffTaskList } = require('../models/tasksModel');

require('dotenv').config();

const createInstallment = async (req, res, next) => {
  try {
    const affectedMonths = getAdjustmentMonths(req.body);
    const settledMonths = await getSettledMonths(req, affectedMonths);
    if (settledMonths.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot save adjustment. Settled month(s): ${settledMonths.join(', ')}`
      });
    }

    const result = await insertAdjustment(req, req.body);

    res.status(200).json({
      success: true,
      message: "Adjustment created successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInstallmentCtrl = async (req, res, next) => {

  try {
    const result = await getAdjustments(req);

    res.status(200).json({
      success: true,
      message: "Get adjustments successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryResultByMonth = async (req, res, next) => {

  const { month, date_from, date_to } = req.body;

  try {
    const result = await getSalaryResult(req, month, {
      dateFrom: date_from || null,
      dateTo: date_to || null
    });

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryDetailByStaff = async (req, res, next) => {

  const { month , staff_id, date_from, date_to } = req.body;

  try {
    const result = await getSalaryDetail(req, month , staff_id, {
      dateFrom: date_from || null,
      dateTo: date_to || null
    });

    res.status(200).json({
      success: true,
      message: "Staff inserted successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryVoucherDetail = async (req, res, next) => {
  const { month, staff_no, staff_id, date_from, date_to } = req.body;
  let client;
  try {
    const staffKey = staff_no || staff_id;
    if (!month || !staffKey) {
      return res.status(400).json({
        success: false,
        message: 'month and staff_no or staff_id are required'
      });
    }
    let resolvedStaffNo = staff_no;
    if (!resolvedStaffNo) {
      client = await req.app.get('pool').connect();
      const staffResult = await client.query(
        `
          SELECT no
          FROM staff
          WHERE staff_id::text = $1
          LIMIT 1
        `,
        [String(staff_id || '')]
      );
      resolvedStaffNo = staffResult.rows[0]?.no;
      client.release();
      client = null;
    }
    if (!resolvedStaffNo) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }
    const startDate = `${month}-01`;
    const tasks = await getStaffTaskList(req, startDate, resolvedStaffNo, {
      dateFrom: date_from || null,
      dateTo: date_to || null
    });
    res.status(200).json({
      success: true,
      message: 'Get salary voucher detail successfully',
      data: tasks
    });
  } catch (error) {
    next(error);
  } finally {
    if (client) client.release();
  }
};

const getSalaryVoucherDetailByBay = async (req, res, next) => {
  const { month, bay_id, date } = req.body;
  try {
    if ((!month && !date) || !bay_id) {
      return res.status(400).json({
        success: false,
        message: 'month or date, and bay_id are required'
      });
    }
    const effectiveMonth = month || String(date).slice(0, 7);
    const tasks = await getSalaryDetailByBay(req, effectiveMonth, bay_id, date || null);
    res.status(200).json({
      success: true,
      message: 'Get salary voucher detail by bay successfully',
      data: tasks
    });
  } catch (error) {
    next(error);
  }
};

const asMoney = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
};

const getBasePay = (attendance, rules = DEFAULT_BASE_PAY_RULES) => {
  const days = Number(attendance || 0);
  const matched = (Array.isArray(rules) ? rules : DEFAULT_BASE_PAY_RULES)
    .map((rule) => ({
      min_days: Number(rule.min_days || 0),
      amount: Number(rule.amount || 0)
    }))
    .filter((rule) => Number.isFinite(rule.min_days) && Number.isFinite(rule.amount))
    .sort((a, b) => b.min_days - a.min_days)
    .find((rule) => days >= rule.min_days);

  return matched ? matched.amount : 0;
};

const getTaskStaffCount = (task) => {
  if (Number(task?.non_trainee_staff_count || 0) > 0) return Number(task.non_trainee_staff_count);
  if (Array.isArray(task?.stafflist)) return task.stafflist.length || 1;
  if (Array.isArray(task?.staffList)) return task.staffList.length || 1;
  return Number(task?.total_staff || 1) || 1;
};

const getAttendanceAbsenteeism = (production, absent) => {
  const absentDays = Number(absent || 0);
  const productionAmount = asMoney(production);
  if (absentDays > 0 && absentDays <= 2) return asMoney(productionAmount * 0.1);
  if (absentDays > 2 && absentDays <= 4) return asMoney(productionAmount * 0.2);
  if (absentDays > 4) return asMoney(productionAmount * 0.25);
  return 0;
};

const hasMoneyValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const combineFinanceAndAdjustments = (finance = {}, adjustment = {}) => ({
  ...finance,
  defect_part_tools: asMoney(finance.defect_part_tools) + asMoney(adjustment.defect_part_tools),
  incentive_deduction: asMoney(finance.incentive_deduction) + asMoney(adjustment.incentive_deduction),
  cash_advance_second: asMoney(finance.cash_advance_second) + asMoney(adjustment.cash_advance_second),
  port_fitment: asMoney(finance.port_fitment) + asMoney(adjustment.port_fitment),
  incentive_addition: asMoney(finance.incentive_addition) + asMoney(adjustment.incentive_addition),
  deposit_release: asMoney(finance.deposit_release) + asMoney(adjustment.deposit_release)
});

const getStaffTaskProduction = (tasks = []) => {
  const totalCents = tasks.reduce((sum, task) => {
    if (String(task?.staff_position || '').toUpperCase() === 'TRAINEE') return sum;
    if (task?.staff_production_price !== undefined && task?.staff_production_price !== null) {
      return sum + Number(task.staff_production_price || 0);
    }
    const totalPrice = Number(task?.total_price || task?.total_task_price || 0);
    const staffCount = getTaskStaffCount(task);
    return sum + (staffCount ? totalPrice / staffCount : 0);
  }, 0);

  return asMoney(totalCents / 100);
};

const buildSalaryTotals = ({ salaryRow = {}, finance = {}, adjustment = {}, production = 0, basePayRules = DEFAULT_BASE_PAY_RULES }) => {
  const attendance = Number(salaryRow.attendance || 0);
  const absent = Number(salaryRow.absent || 0);
  const late = Number(salaryRow.late || 0);
  const mc = Number(salaryRow.mc || 0);
  const hl = Number(salaryRow.hl || 0);
  const q = Number(salaryRow.q || 0);
  const al = Number(salaryRow.al || 0);
  const el = Number(salaryRow.el || 0);
  const ul = Number(salaryRow.ul || 0);
  const cl = Number(salaryRow.cl || 0);
  const hasStoredBasePay = salaryRow.base_pay !== undefined && salaryRow.base_pay !== null;
  const basePay = hasStoredBasePay ? asMoney(salaryRow.base_pay) : getBasePay(attendance, basePayRules);
  const systemDeduction = asMoney(Number(salaryRow.total_deduct || 0));
  const epf11 = asMoney(basePay * 0.11);
  const epf13 = asMoney(basePay * 0.13);
  const effectiveFinance = combineFinanceAndAdjustments(finance, adjustment);
  const attendanceAbsenteeism = getAttendanceAbsenteeism(production, absent);
  const finalPaymentDeduction =
    asMoney(effectiveFinance.socso) +
    asMoney(effectiveFinance.sip) +
    asMoney(effectiveFinance.pcb) +
    asMoney(effectiveFinance.defect_part_tools) +
    attendanceAbsenteeism +
    asMoney(effectiveFinance.cash_advance_second) +
    asMoney(effectiveFinance.deposit) +
    asMoney(effectiveFinance.incentive_deduction);
  const financeAddition = asMoney(effectiveFinance.incentive_addition) + asMoney(effectiveFinance.deposit_release) + asMoney(effectiveFinance.port_fitment);
  const contractorAmount = asMoney(basePay);
  const socsoEmployer = hasMoneyValue(effectiveFinance.socso_employer) ? asMoney(effectiveFinance.socso_employer) : 0;
  const sipEmployer = hasMoneyValue(effectiveFinance.sip_employer) ? asMoney(effectiveFinance.sip_employer) : asMoney(effectiveFinance.sip);
  const contributionGroupD = socsoEmployer + sipEmployer;
  const nettProduction = asMoney(production - epf13 - contributionGroupD);
  const balanceCommission = asMoney(nettProduction - contractorAmount);
  const firstPaymentTotal = asMoney(contractorAmount - epf11 - asMoney(effectiveFinance.cash_advance_first));
  const finalBalancePayment = asMoney(balanceCommission - systemDeduction - finalPaymentDeduction + financeAddition);
  const totalPayOut = asMoney(production);

  return {
    attendance,
    absent,
    late,
    mc,
    hl,
    q,
    al,
    el,
    ul,
    cl,
    mcHlQ: asMoney(mc + hl + q),
    alElUlCl: asMoney(al + el + ul + cl),
    basePay,
    production: balanceCommission,
    systemDeduction,
    contractorAmount,
    firstPaymentTotal,
    finalBalancePayment,
    totalPayOut,
    totals: {
      contractor_amount: contractorAmount,
      epf_11: epf11,
      cash_advance_first: asMoney(effectiveFinance.cash_advance_first),
      first_payment_total: firstPaymentTotal,
      epf_13: epf13,
      socso: asMoney(effectiveFinance.socso),
      sip: asMoney(effectiveFinance.sip),
      socso_employer: socsoEmployer,
      sip_employer: sipEmployer,
      balance_commission: balanceCommission,
      defect_part_tools: asMoney(effectiveFinance.defect_part_tools),
      pcb: asMoney(effectiveFinance.pcb),
      incentive_deduction: asMoney(effectiveFinance.incentive_deduction),
      attendance_absenteeism: attendanceAbsenteeism,
      cash_advance_second: asMoney(effectiveFinance.cash_advance_second),
      deposit: asMoney(effectiveFinance.deposit),
      port_fitment: asMoney(effectiveFinance.port_fitment),
      incentive_addition: asMoney(effectiveFinance.incentive_addition),
      deposit_release: asMoney(effectiveFinance.deposit_release),
      final_balance_payment: finalBalancePayment,
      nett_production: nettProduction,
      total_pay_out: totalPayOut
    }
  };
};

const getSalaryMonthStatus = async (req, res, next) => {
  const { month } = req.body;

  try {
    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'month is required'
      });
    }

    const result = await getSalaryMonthStatusData(req, month);

    res.status(200).json({
      success: true,
      message: 'Get salary month status successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryBasePayRulesCtrl = async (req, res, next) => {
  const { month } = req.body;

  try {
    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'month is required'
      });
    }

    const result = await getSalaryBasePayRules(req, month);

    res.status(200).json({
      success: true,
      message: 'Get salary base pay rules successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateSalaryBasePayRulesCtrl = async (req, res, next) => {
  const { month, rules } = req.body;

  try {
    if (!month || !Array.isArray(rules)) {
      return res.status(400).json({
        success: false,
        message: 'month and rules are required'
      });
    }

    const status = await getSalaryMonthStatusData(req, month);
    if (status.is_settled) {
      return res.status(400).json({
        success: false,
        message: `${month} is settled and base pay rules cannot be changed.`
      });
    }

    const result = await upsertSalaryBasePayRules(req, month, rules);

    res.status(200).json({
      success: true,
      message: 'Salary base pay rules saved',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const importSalaryFinanceInputs = async (req, res, next) => {
  const { month, rows } = req.body;

  try {
    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'month and rows are required'
      });
    }

    const result = await upsertSalaryFinanceInputs(req, month, rows);

    res.status(200).json({
      success: result.errors.length === 0,
      message: result.errors.length === 0 ? 'Finance salary inputs imported' : 'Finance salary inputs imported with errors',
      data: {
        imported_count: result.imported.length,
        error_count: result.errors.length,
        imported: result.imported,
        errors: result.errors
      }
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryFinanceExport = async (req, res, next) => {
  const { month } = req.body || {};

  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) {
      return res.status(400).json({
        success: false,
        message: 'A valid month in YYYY-MM format is required'
      });
    }

    const [salaryRows, financeByStaff, adjustmentsByStaff, basePayRuleData] = await Promise.all([
      getSalaryResult(req, month),
      getFinanceInputsForMonth(req, month),
      getSalaryAdjustmentsForMonth(req, month),
      getSalaryBasePayRules(req, month)
    ]);

    const rows = salaryRows.map((salaryRow) => {
      const isSnapshot = Boolean(salaryRow.is_settlement_snapshot);
      const finance = isSnapshot
        ? (salaryRow.finance || {})
        : (financeByStaff[String(salaryRow.no)] || {});
      const adjustment = isSnapshot ? {} : (adjustmentsByStaff[Number(salaryRow.no)] || {});
      const production = isSnapshot
        ? Number(salaryRow.total_pay_out ?? salaryRow.production ?? (Number(salaryRow.total_com || 0) / 100))
        : Number(salaryRow.total_com || 0) / 100;
      const salaryTotals = buildSalaryTotals({
        salaryRow,
        finance,
        adjustment,
        production,
        basePayRules: basePayRuleData.rules
      });

      return {
        month,
        staff: {
          no: salaryRow.no,
          staff_id: salaryRow.staff_id,
          name: salaryRow.name,
          nick_name: salaryRow.nick_name,
          ic: salaryRow.ic,
          bank_name: salaryRow.bank_name,
          acc_number: salaryRow.acc_number
        },
        attendance: salaryTotals.attendance,
        absent: salaryTotals.absent,
        system_deduction: salaryTotals.systemDeduction,
        finance,
        totals: salaryTotals.totals
      };
    });

    res.status(200).json({
      success: true,
      message: 'Get salary finance export successfully',
      data: { rows }
    });
  } catch (error) {
    next(error);
  }
};

const getSalaryVoucherSummary = async (req, res, next) => {
  const { month, staff_no, staff_id, date_from, date_to } = req.body;
  const rangeOptions = {
    dateFrom: date_from || null,
    dateTo: date_to || null
  };
  const hasDateRange = Boolean(rangeOptions.dateFrom && rangeOptions.dateTo);
  let client;

  try {
    if (!month || (!staff_no && !staff_id)) {
      return res.status(400).json({
        success: false,
        message: 'month and staff_no or staff_id are required'
      });
    }

    client = await req.app.get('pool').connect();
    const staff = staff_no
      ? (await client.query(
          `
            SELECT no, staff_id, name, nick_name, ic, bank_name, acc_number
            FROM staff
            WHERE no::text = $1
            LIMIT 1
          `,
          [String(staff_no || '')]
        )).rows[0] || null
      : (await client.query(
          `
            SELECT no, staff_id, name, nick_name, ic, bank_name, acc_number
            FROM staff
            WHERE staff_id::text = $1
            LIMIT 1
          `,
          [String(staff_id || '')]
        )).rows[0] || null;
    console.log('[getSalaryVoucherSummary] staff lookup', {
      input_staff_no: staff_no || null,
      input_staff_id: staff_id || null,
      resolved_no: staff?.no || null,
      resolved_staff_id: staff?.staff_id || null,
      resolved_name: staff?.name || null,
      month,
      date_from: date_from || null,
      date_to: date_to || null
    });
    client.release();
    client = null;

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    const salaryRows = await getSalaryResult(req, month, rangeOptions);
    const salaryRow = salaryRows.find((row) => String(row.no) === String(staff.no)) || {};
    const snapshot = hasDateRange ? null : await getSalarySnapshotByStaff(req, month, staff.no);
    const finance = snapshot?.finance || await getFinanceInputByStaff(req, month, staff.no) || {};
    const tasks = await getStaffTaskList(req, `${month}-01`, staff.no, rangeOptions);
    const basePayRuleData = await getSalaryBasePayRules(req, month);
    const basePayRules = basePayRuleData.rules;
    const adjustmentsByStaff = snapshot ? {} : await getSalaryAdjustmentsForMonth(req, month, staff.no);
    const adjustment = adjustmentsByStaff[Number(staff.no)] || {};

    const production = snapshot ? Number(snapshot.production || 0) : getStaffTaskProduction(tasks);
    const salaryTotals = snapshot
      ? {
          attendance: Number(snapshot.attendance || 0),
          absent: Number(snapshot.absent || 0),
          late: Number(snapshot.late || 0),
          mc: Number(snapshot.mc || 0),
          hl: Number(snapshot.hl || 0),
          q: Number(snapshot.q || 0),
          al: Number(snapshot.al || 0),
          el: Number(snapshot.el || 0),
          ul: Number(snapshot.ul || 0),
          cl: Number(snapshot.cl || 0),
          mcHlQ: asMoney(Number(snapshot.mc || 0) + Number(snapshot.hl || 0) + Number(snapshot.q || 0)),
          alElUlCl: asMoney(Number(snapshot.al || 0) + Number(snapshot.el || 0) + Number(snapshot.ul || 0) + Number(snapshot.cl || 0)),
          production: Number(snapshot.production || 0),
          systemDeduction: Number(snapshot.system_deduction || 0),
          totals: {
            ...buildSalaryTotals({ salaryRow: snapshot, finance, production: Number(snapshot.production || 0), basePayRules }).totals,
            contractor_amount: Number(snapshot.base_pay || 0),
            final_balance_payment: Number(snapshot.final_balance_payment || 0),
            total_pay_out: Number(snapshot.production || 0),
            nett_production: asMoney(
              Number(snapshot.production || 0)
              - asMoney(Number(snapshot.base_pay || 0) * 0.13)
              - (hasMoneyValue(finance.socso_employer) ? asMoney(finance.socso_employer) : 0)
              - (hasMoneyValue(finance.sip_employer) ? asMoney(finance.sip_employer) : asMoney(finance.sip))
            )
          }
        }
      : buildSalaryTotals({ salaryRow, finance, adjustment, production, basePayRules });

    res.status(200).json({
      success: true,
      message: 'Get salary voucher summary successfully',
      data: {
        month,
        staff: {
          no: staff.no,
          staff_id: staff.staff_id,
          name: staff.name,
          nick_name: staff.nick_name,
          ic: staff.ic,
          bank_name: staff.bank_name,
          acc_number: staff.acc_number
        },
        attendance: salaryTotals.attendance,
        absent: salaryTotals.absent,
        late: salaryTotals.late,
        mc: salaryTotals.mc,
        hl: salaryTotals.hl,
        q: salaryTotals.q,
        al: salaryTotals.al,
        el: salaryTotals.el,
        ul: salaryTotals.ul,
        cl: salaryTotals.cl,
        mc_hl_q: salaryTotals.mcHlQ,
        al_el_ul_cl: salaryTotals.alElUlCl,
        production: salaryTotals.production,
        system_deduction: salaryTotals.systemDeduction,
        finance,
        adjustments: adjustment.rows || [],
        base_pay_rules: basePayRuleData,
        totals: salaryTotals.totals,
        tasks
      }
    });
  } catch (error) {
    if (client) client.release();
    next(error);
  }
};

const setSettlement = async (req, res, next) => {

  const { month } = req.body;

  try {
    const basePayRuleData = await getSalaryBasePayRules(req, month);
    const basePayRules = basePayRuleData.rules;
    const adjustmentsByStaff = await getSalaryAdjustmentsForMonth(req, month);
    const salaryRows = await getSalaryResult(req, month, { useSnapshot: false });
    const snapshotRows = [];

    for (const row of salaryRows) {
      const finance = await getFinanceInputByStaff(req, month, row.no) || {};
      const adjustment = adjustmentsByStaff[Number(row.no)] || {};
      const production = asMoney(Number(row.total_com || 0) / 100);
      const totals = buildSalaryTotals({ salaryRow: row, finance, adjustment, production, basePayRules });

      snapshotRows.push({
        ...row,
        total_com: Number(row.total_com || 0),
        total_deduct: totals.systemDeduction,
        total_installment: Number(row.total_installment || 0),
        attendance: totals.attendance,
        absent: totals.absent,
        late: totals.late,
        mc: totals.mc,
        hl: totals.hl,
        q: totals.q,
        al: totals.al,
        el: totals.el,
        ul: totals.ul,
        cl: totals.cl,
        base_pay: totals.basePay,
        production: totals.production,
        system_deduction: totals.systemDeduction,
        final_balance_payment: totals.finalBalancePayment,
        total_pay_out: totals.totalPayOut,
        finance: combineFinanceAndAdjustments(finance, adjustment)
      });
    }

    const result = await insertSettlement(req, month, snapshotRows);

    res.status(200).json({
      success: true,
      message: result.already_settled ? "Salary month already settled" : "Salary settlement completed",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getInstallmentByNoCtrl = async (req, res, next) => {
  const { no } = req.body;

  try {
    const result = await getAdjustmentByNo(req, no);

    res.status(200).json({
      success: true,
      message: "Get adjustment successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const getAdjustmentsBySourceCtrl = async (req, res, next) => {
  const { source_type, source_id } = req.body;

  try {
    if (!source_type || !source_id) {
      return res.status(400).json({
        success: false,
        message: 'source_type and source_id are required'
      });
    }

    const result = await getAdjustmentsBySource(req, { source_type, source_id });

    res.status(200).json({
      success: true,
      message: 'Get source adjustments successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateAdjustmentCtrl = async (req, res, next) => {
  const { id, no, amount, remark, cv_code } = req.body || {};
  const adjustmentId = id || no;

  try {
    if (!adjustmentId) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment id is required'
      });
    }

    const result = await updateAdjustment(req, adjustmentId, { amount, remark, cv_code });

    res.status(200).json({
      success: true,
      message: 'Adjustment updated successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const cancelAdjustmentCtrl = async (req, res, next) => {
  const { id, no } = req.body || {};
  const adjustmentId = id || no;

  try {
    if (!adjustmentId) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment id is required'
      });
    }

    const result = await cancelAdjustment(req, adjustmentId);

    res.status(200).json({
      success: true,
      message: 'Adjustment cancelled successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// insertSettlement

module.exports = {
  createInstallment,
  getInstallmentCtrl,
  getInstallmentByNoCtrl,
  getAdjustmentsBySourceCtrl,
  updateAdjustmentCtrl,
  cancelAdjustmentCtrl,
  getSalaryResultByMonth,
  getSalaryDetailByStaff,
  getSalaryVoucherDetail,
  getSalaryVoucherDetailByBay,
  getSalaryMonthStatus,
  getSalaryBasePayRulesCtrl,
  updateSalaryBasePayRulesCtrl,
  importSalaryFinanceInputs,
  getSalaryFinanceExport,
  getSalaryVoucherSummary,
  setSettlement
};
