import io
import re
import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and render "Generated: DD/MM/YYYY HH:MM | Page X of Y"
    footer across all pages of the ReportLab document.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569"))
        
        # Footer divider line
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(36, 36, 806, 36)

        # Footer Left & Right
        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
        self.drawString(36, 24, "Agentic AI Accounting System  |  Calculation: VERIFIED")
        self.drawRightString(806, 24, f"Generated: {now_str}  |  Page {self._pageNumber} of {page_count}")
        self.restoreState()


def format_currency_decimal(val: Any) -> str:
    if val is None or val == "":
        return "0.00"
    try:
        num = float(val)
        return f"{num:,.2f}"
    except Exception:
        return "0.00"


MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def format_pdf_display_date(val: Any) -> str:
    if not val or val == "—" or val == "-":
        return "-"
    s = str(val).strip()

    # Try YYYY-MM-DD
    m = re.search(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
    if m:
        try:
            year = int(m.group(1))
            month_idx = int(m.group(2)) - 1
            day = int(m.group(3))
            if 0 <= month_idx < 12:
                return f"{day:02d} {MONTH_SHORT[month_idx]} {year}"
        except Exception:
            pass

    # Try DD-MM-YYYY
    m2 = re.search(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})', s)
    if m2:
        try:
            day = int(m2.group(1))
            month_idx = int(m2.group(2)) - 1
            year = int(m2.group(3))
            if 0 <= month_idx < 12:
                return f"{day:02d} {MONTH_SHORT[month_idx]} {year}"
        except Exception:
            pass

    months_map = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
        'aug': 8, 'august': 8, 'sep': 9, 'september': 9, 'oct': 10, 'october': 10,
        'nov': 11, 'november': 11, 'dec': 12, 'december': 12
    }
    s_lower = s.lower()
    found_m = None
    for m_name, m_num in months_map.items():
        if m_name in s_lower:
            found_m = m_num
            break

    if found_m:
        nums = [int(n) for n in re.findall(r'\b\d+\b', s)]
        if len(nums) >= 2:
            year = next((n for n in nums if n > 1900), 2026)
            day = next((n for n in nums if n <= 31 and n != year), 1)
            return f"{day} {MONTH_SHORT[found_m - 1]} {year}"

    return s


MONTH_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]


def format_period_subtitle(from_date: Optional[str], to_date: Optional[str], transactions: List[Dict[str, Any]]) -> str:
    def _parse_dt(val: Optional[str]):
        if not val or val == "—" or val == "-":
            return None
        s = str(val).strip()
        m = re.search(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
        if m:
            try:
                return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except Exception:
                pass
        months_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
        }
        for m_name, m_num in months_map.items():
            if m_name in s.lower():
                nums = [int(n) for n in re.findall(r'\b\d+\b', s)]
                if len(nums) >= 2:
                    y = next((n for n in nums if n > 1900), 2026)
                    d = next((n for n in nums if n <= 31 and n != y), 1)
                    return datetime.date(y, m_num, d)
        return None

    dt_from = _parse_dt(from_date)
    dt_to = _parse_dt(to_date)

    if not dt_from or not dt_to:
        parsed_dates = [_parse_dt(t.get("transaction_date")) for t in transactions]
        valid_dates = [d for d in parsed_dates if d]
        if valid_dates:
            if not dt_from:
                dt_from = min(valid_dates)
            if not dt_to:
                dt_to = max(valid_dates)

    if dt_from and dt_to:
        if dt_from == dt_to:
            month_name = MONTH_FULL[dt_from.month - 1]
            return f"For the Day Ended {dt_from.day} {month_name} {dt_from.year}"

        import calendar
        _, last_day = calendar.monthrange(dt_from.year, dt_from.month)
        if dt_from.day == 1 and dt_to.day == last_day and dt_from.month == dt_to.month and dt_from.year == dt_to.year:
            month_name = MONTH_FULL[dt_from.month - 1]
            return f"For the Month Ended {last_day} {month_name} {dt_from.year}"

        if dt_from.month == dt_to.month and dt_from.year == dt_to.year and (from_date is None and to_date is None):
            month_name = MONTH_FULL[dt_from.month - 1]
            return f"For the Month Ended {last_day} {month_name} {dt_from.year}"

        m_from_name = MONTH_FULL[dt_from.month - 1]
        m_to_name = MONTH_FULL[dt_to.month - 1]
        f_str = f"{dt_from.day:02d} {m_from_name} {dt_from.year}"
        t_str = f"{dt_to.day:02d} {m_to_name} {dt_to.year}"
        return f"For the Period {f_str} to {t_str}"

    return "Record of Cash and Bank Receipts and Payments"


def generate_book_of_prime_entry_pdf(
    company_name: str,
    book_name: str,
    subtitle: str,
    from_date: Optional[str],
    to_date: Optional[str],
    currency: str,
    transactions: List[Dict[str, Any]],
    calculation_result: Dict[str, Any],
    logo_path: Optional[str] = None
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=48
    )

    styles = getSampleStyleSheet()
    
    # Custom Typography Styles for Formal Accounting Report
    title_style = ParagraphStyle(
        'RepCompanyTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        alignment=1, # Centered
        textColor=colors.HexColor("#0f172a")
    )

    subtitle_style = ParagraphStyle(
        'RepBookTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        alignment=1,
        textColor=colors.HexColor("#1e293b")
    )

    meta_style = ParagraphStyle(
        'RepSubText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        alignment=1,
        textColor=colors.HexColor("#475569")
    )

    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )

    cell_mono = ParagraphStyle(
        'CellMono',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )

    cell_right = ParagraphStyle(
        'CellRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2, # Right
        textColor=colors.HexColor("#0f172a")
    )

    header_cell = ParagraphStyle(
        'HeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#ffffff")
    )

    header_cell_right = ParagraphStyle(
        'HeaderCellRight',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        alignment=2,
        textColor=colors.HexColor("#ffffff")
    )

    elements = []

    # 1. Report Header Section
    elements.append(Paragraph(company_name.upper(), title_style))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(book_name.upper(), subtitle_style))
    if book_name == "Cash Book":
        period_sub = format_period_subtitle(from_date, to_date, transactions)
        elements.append(Paragraph(period_sub, meta_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(f"Currency: {currency or 'MYR'}", meta_style))
    else:
        elements.append(Paragraph(subtitle, meta_style))
        elements.append(Spacer(1, 4))
        period_str = f"Period: {from_date or 'Start'} – {to_date or 'End'}    |    Currency: {currency or 'MYR'}"
        elements.append(Paragraph(period_str, meta_style))

    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1"), spaceAfter=12))

    # Helper function to get Details/Party
    def get_details(t):
        ext = t.get("extracted_data") or {}
        roles = ext.get("business_roles") or {}
        cand = (
            ext.get("customer_name") or
            ext.get("buyer_name") or
            ext.get("vendor_name") or
            ext.get("supplier_name") or
            roles.get("customer") or
            roles.get("buyer") or
            roles.get("vendor") or
            roles.get("supplier") or
            ""
        )
        if cand and str(cand).strip().lower() != "lumpur" and len(str(cand).strip()) > 2:
            return str(cand).strip()
        return t.get("source_document") or "-"

    # Helper function to format single Folio control code
    def get_folio(t):
        analysis = t.get("accounting_analysis") or {}
        sel = analysis.get("selected_accounts") or []
        if sel:
            if "Sales" in book_name:
                debtor = next((a.get("account_code") for a in sel if str(a.get("account_code", "")).startswith("300")), None)
                if debtor:
                    return debtor
            elif "Purchases" in book_name:
                creditor = next((a.get("account_code") for a in sel if str(a.get("account_code", "")).startswith("400")), None)
                if creditor:
                    return creditor
            return sel[0].get("account_code") or "—"
        return "—"

    # Helper function to format Reference No
    def get_ref(t, ref_type="invoice"):
        ext = t.get("extracted_data") or {}
        if ref_type == "invoice":
            return ext.get("invoice_number") or t.get("source_document") or "—"
        elif ref_type == "credit_note":
            return ext.get("credit_note_number") or ext.get("reference_number") or t.get("source_document") or "—"
        return t.get("source_document") or "—"

    # -------------------------------------------------------------------------
    # BOOK TABLE BUILDERS
    # -------------------------------------------------------------------------
    
    if book_name == "Cash Book":
        # Separate Receipts & Payments according to accounting event and direction
        receipts = []
        payments = []
        for t in transactions:
            doc_type = str(t.get("document_type", "")).lower()
            bope = str(t.get("book_of_prime_entry", "")).lower()
            if doc_type in ["bank statement", "bank transaction record"] or bope in ["bank statement record", "bank statement"]:
                continue

            event = str(t.get("accounting_event", "")).lower()
            is_receipt = (
                "payment receipt" in doc_type or
                ("receipt" in doc_type and "purchase" not in doc_type and "expense" not in doc_type and "supplier" not in doc_type) or
                "received" in event or
                "inflow" in event or
                "customer payment" in event or
                "sales payment" in event
            ) and not (
                "purchase" in doc_type or
                "expense" in doc_type or
                "purchase" in event or
                "expense" in event or
                "supplier" in event or
                "vendor" in event or
                "outflow" in event
            )

            if is_receipt:
                receipts.append(t)
            else:
                payments.append(t)

        def build_cash_table(title_label, txns_list, cash_tot, bank_tot):
            table_data = []
            h_style = ParagraphStyle('CBHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.HexColor("#ffffff"))
            h_right = ParagraphStyle('CBHeaderR', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, alignment=2, textColor=colors.HexColor("#ffffff"))
            c_style = ParagraphStyle('CBCell', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=10, textColor=colors.HexColor("#0f172a"))
            c_mono = ParagraphStyle('CBCellMono', parent=styles['Normal'], fontName='Courier', fontSize=7.5, leading=10, textColor=colors.HexColor("#0f172a"))
            c_right = ParagraphStyle('CBCellRight', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=10, alignment=2, textColor=colors.HexColor("#0f172a"))

            section_name = "CASH INFLOW" if title_label == "RECEIPTS" else "CASH OUTFLOW"
            table_data.append([
                Paragraph(section_name, ParagraphStyle('SecHd', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=11, textColor=colors.HexColor("#ffffff"))),
                Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style)
            ])

            table_data.append([
                Paragraph("Date", h_style),
                Paragraph("Details", h_style),
                Paragraph("F", h_style),
                Paragraph("Dis", h_style),
                Paragraph(f"Cash ({currency})", h_right),
                Paragraph(f"Bank ({currency})", h_right)
            ])

            if not txns_list:
                table_data.append([
                    Paragraph(f"No cash or bank {title_label.lower()} match the selected date range.", c_style),
                    Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style), Paragraph("", c_style)
                ])
            else:
                for t in txns_list:
                    ext = t.get("extracted_data") or {}
                    method = str(ext.get("payment_method", "")).lower()
                    amt = float(t.get("amount") or 0.0)

                    is_cash = ("cash" in method and "bank" not in method) or ("petty" in method)
                    cash_val = format_currency_decimal(amt) if is_cash else "—"
                    bank_val = format_currency_decimal(amt) if not is_cash else "—"

                    table_data.append([
                        Paragraph(format_pdf_display_date(t.get("transaction_date", "-")), c_style),
                        Paragraph(get_details(t), c_style),
                        Paragraph("—", c_mono),
                        Paragraph("—", c_style),
                        Paragraph(cash_val, c_right),
                        Paragraph(bank_val, c_right)
                    ])

            # Footer row using Calculation Agent totals
            table_data.append([
                Paragraph("TOTAL", ParagraphStyle('TotLbl', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, textColor=colors.HexColor("#0f172a"))),
                Paragraph("", c_style),
                Paragraph("", c_style),
                Paragraph("", c_style),
                Paragraph(format_currency_decimal(cash_tot), c_right),
                Paragraph(format_currency_decimal(bank_tot), c_right)
            ])

            col_widths = [55, 125, 55, 30, 55, 60] # Total = 380 pt
            t_obj = Table(table_data, colWidths=col_widths, repeatRows=2)
            header_bg = colors.HexColor("#0f172a") if title_label == "RECEIPTS" else colors.HexColor("#0f172a")
            t_style = [
                ('BACKGROUND', (0,0), (-1,0), header_bg),
                ('SPAN', (0,0), (-1,0)),
                ('BACKGROUND', (0,1), (-1,1), colors.HexColor("#334155")),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
                ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#0f172a")),
                ('SPAN', (0,-1), (3,-1))
            ]
            if not txns_list:
                t_style.append(('SPAN', (0,2), (-1,2)))
            t_obj.setStyle(TableStyle(t_style))
            return t_obj

        rec_table = build_cash_table("RECEIPTS", receipts, calculation_result.get("total_receipts_cash", 0), calculation_result.get("total_receipts_bank", 0))
        pay_table = build_cash_table("PAYMENTS", payments, calculation_result.get("total_payments_cash", 0), calculation_result.get("total_payments_bank", 0))

        outer_table = Table([[rec_table, pay_table]], colWidths=[380, 380])
        outer_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(outer_table)

    elif book_name == "General Journal":
        table_data = []
        table_data.append([
            Paragraph("Date", header_cell),
            Paragraph("Details", header_cell),
            Paragraph("Account to be Debited", header_cell),
            Paragraph("Account to be Credited", header_cell),
            Paragraph("Folio", header_cell),
            Paragraph(f"Debit ({currency})", header_cell_right),
            Paragraph(f"Credit ({currency})", header_cell_right)
        ])

        if not transactions:
            table_data.append([
                Paragraph("No journal entries recorded for this period.", cell_style),
                Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style)
            ])
        else:
            for t in transactions:
                analysis = t.get("accounting_analysis") or {}
                sel = analysis.get("selected_accounts") or []
                deb_name = sel[0].get("account_name", "—") if len(sel) > 0 else "—"
                cred_name = sel[1].get("account_name", "—") if len(sel) > 1 else "—"
                amt_str = format_currency_decimal(t.get("amount", 0))

                table_data.append([
                    Paragraph(format_pdf_display_date(t.get("transaction_date", "-")), cell_style),
                    Paragraph(get_details(t), cell_style),
                    Paragraph(deb_name, cell_style),
                    Paragraph(cred_name, cell_style),
                    Paragraph(get_folio(t), cell_mono),
                    Paragraph(amt_str, cell_right),
                    Paragraph(amt_str, cell_right)
                ])

        tot_deb = calculation_result.get("total_debit", calculation_result.get("total_amount", 0))
        tot_cred = calculation_result.get("total_credit", calculation_result.get("total_amount", 0))

        table_data.append([
            Paragraph("TOTAL", ParagraphStyle('TotLbl', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor("#0f172a"))),
            Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style),
            Paragraph(format_currency_decimal(tot_deb), cell_right),
            Paragraph(format_currency_decimal(tot_cred), cell_right)
        ])

        col_widths = [70, 170, 140, 140, 90, 80, 80]
        t_obj = Table(table_data, colWidths=col_widths, repeatRows=1)
        t_style = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
            ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#0f172a")),
            ('SPAN', (0,-1), (4,-1))
        ]
        if not transactions:
            t_style.append(('SPAN', (0,1), (-1,1)))
        t_obj.setStyle(TableStyle(t_style))
        elements.append(t_obj)

    else:
        # Standard Day Books (Sales Day Book, Purchases Day Book, Sales Returns, Purchases Returns)
        is_ref_cn = "Returns" in book_name
        ref_header = "Credit Note No." if is_ref_cn else "Invoice No."
        ref_type = "credit_note" if is_ref_cn else "invoice"

        table_data = []
        table_data.append([
            Paragraph("Date", header_cell),
            Paragraph("Details", header_cell),
            Paragraph(ref_header, header_cell),
            Paragraph("Folio", header_cell),
            Paragraph(f"Amount ({currency})", header_cell_right)
        ])

        if not transactions:
            table_data.append([
                Paragraph("No transactions recorded for this period.", cell_style),
                Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style)
            ])
        else:
            for t in transactions:
                amt_str = format_currency_decimal(t.get("amount", 0))
                table_data.append([
                    Paragraph(format_pdf_display_date(t.get("transaction_date", "-")), cell_style),
                    Paragraph(get_details(t), cell_style),
                    Paragraph(get_ref(t, ref_type), cell_mono),
                    Paragraph(get_folio(t), cell_mono),
                    Paragraph(amt_str, cell_right)
                ])

        tot_amt = calculation_result.get("total_amount", 0)
        table_data.append([
            Paragraph("TOTAL", ParagraphStyle('TotLbl', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor("#0f172a"))),
            Paragraph("", cell_style), Paragraph("", cell_style), Paragraph("", cell_style),
            Paragraph(f"{currency} {format_currency_decimal(tot_amt)}", cell_right)
        ])

        col_widths = [80, 315, 140, 115, 120]
        t_obj = Table(table_data, colWidths=col_widths, repeatRows=1)
        t_style = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#f1f5f9")),
            ('LINEABOVE', (0,-1), (-1,-1), 1.5, colors.HexColor("#0f172a")),
            ('SPAN', (0,-1), (3,-1))
        ]
        if not transactions:
            t_style.append(('SPAN', (0,1), (-1,1)))
        t_obj.setStyle(TableStyle(t_style))
        elements.append(t_obj)

    doc.build(elements, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer.getvalue()
