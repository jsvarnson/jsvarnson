'Attribute VB_Name = "ExportToPDF"
'==============================================================================
' ExportToPDF - VBA Macro for Excel-to-PDF Table Export
'==============================================================================
' This macro reads a table from the active workbook, filters rows where the
' "Include" column is "Yes", builds a formatted table on a temporary worksheet,
' and exports it to a landscape-oriented PDF.
'
' PDF Layout:
'   - Landscape orientation, multi-page
'   - First page: title + description paragraph above the table
'   - All pages: "Updated: MM/dd/YYYY" in the top-right header
'   - Left columns and right columns use normal horizontal text
'   - Middle columns use vertically-rotated text (90 degrees) to save width
'
' USAGE:
'   1. Place your source data in a worksheet named SOURCE_SHEET_NAME (below).
'   2. Set TABLE_START_COL, TABLE_START_ROW, and TABLE_END_COL to define the
'      table range. The last row is calculated automatically.
'   3. Assign the "ExportTableToPDF" macro to a button in the workbook.
'   4. Click the button to generate and save the PDF.
'
' CUSTOMIZATION:
'   - Edit the constants and column arrays below to match your data.
'==============================================================================
'Option Explicit
'------------------------------------------------------------------------------
' CONFIGURATION - Edit these values to match your workbook
'------------------------------------------------------------------------------
' The worksheet that contains the source data table
Private Const SOURCE_SHEET_NAME As String = "US"
' Source table range definition
' Set the start column letter, start row number, and end column letter.
' The last row is auto-calculated from the start column.
' Example: TABLE_START_COL="B", TABLE_START_ROW=9, TABLE_END_COL="K"
'          produces a range like "B9:K<lastrow>"
Private Const TABLE_START_COL As String = "A"
Private Const TABLE_START_ROW As Long = 9
Private Const TABLE_END_COL As String = "AL"
' PDF title (first page only)
Private Const PDF_TITLE As String = "Molson Coors Beverage Company"
' PDF description paragraph (first page only, appears below the title)
Private Const PDF_DESCRIPTION As String = _
    "Nutritional, Ingredient and Fermentation Source Data – Brands sold in the U.S. only." & vbLf & _
    "Values are average and approximate and are based on a standard regulatory serving size. " & _
    "Our products contain no Fat, Cholesterol, or High Fructose Corn Syrup. " & _
    "Where corn syrup is used as an adjunct to aid fermentation, it is consumed " & _
    "by yeast during that process and is not present in the final product."
' Default PDF output path (empty string = prompt user with Save As dialog)
Private Const DEFAULT_PDF_PATH As String = ""
'------------------------------------------------------------------------------
' FORMATTING CONSTANTS
'------------------------------------------------------------------------------
'Private Const LEFT_COL_WIDTH As Double = 18        ' Width for left columns - 18
'Private Const MIDDLE_COL_WIDTH As Double = 6       ' Width for vertical middle columns - 3.5
'Private Const RIGHT_COL_WIDTH As Double = 30       ' Width for right columns - 18
'Private Const HEADER_ROW_HEIGHT As Double = 90     ' Height for the header row (vertical text) - 90
'Private Const MIN_DATA_ROW_HEIGHT As Double = 15   ' Minimum height for data rows - 15
'Private Const TITLE_FONT_SIZE As Integer = 28      ' Font size for the title - 14
'Private Const DESC_FONT_SIZE As Integer = 14       ' Font size for the description - 10
'Private Const HEADER_FONT_SIZE As Integer = 12     ' Font size for table headers - 8
'Private Const DATA_FONT_SIZE As Integer = 11       ' Font size for table data - 8
'Private Const HEADER_BG_COLOR As Long = 6697728    ' Dark teal header background (RGB: 0, 102, 102) - 6697728
'Private Const ALT_ROW_COLOR As Long = 15921906     ' Light gray for alternating rows - 15921906
' General
Private Const TITLE_TOP_SPACER As Double = 20      ' Spacer height above title to clear page header - 20
Private Const HEADER_ROW_HEIGHT As Double = 90     ' Height for the header row (vertical text) - 90
Private Const MIN_DATA_ROW_HEIGHT As Double = 15   ' Minimum height for data rows - 15
Private Const TITLE_FONT_SIZE As Integer = 28      ' Font size for the title - 14
Private Const DESC_FONT_SIZE As Integer = 14       ' Font size for the description - 10
Private Const ALT_ROW_COLOR As Long = 15921906     ' Light gray for alternating rows - 15921906

' Left section header formatting
Private Const LEFT_HDR_FONT_SIZE As Integer = 12   ' Header font size - 12
Private Const LEFT_HDR_BOLD As Boolean = True       ' Header bold - True
Private Const LEFT_HDR_FONT_COLOR As Long = 16777215 ' Header font color (white) - 16777215
Private Const LEFT_HDR_BG_COLOR As Long = 4136713  ' Header background (#091F3F) - 4136713
Private Const LEFT_HDR_H_ALIGN As Long = -4108     ' Header horizontal alignment (xlCenter) - -4108
Private Const LEFT_HDR_V_ALIGN As Long = -4108     ' Header vertical alignment (xlCenter) - -4108
Private Const LEFT_HDR_WRAP_TEXT As Boolean = False ' Header wrap text - False
Private Const LEFT_HDR_ORIENTATION As Integer = 0  ' Header text orientation (degrees) - 0

' Left section data formatting
Private Const LEFT_COL_WIDTH As Double = 18        ' Column width - 18
Private Const LEFT_DATA_FONT_SIZE As Integer = 11  ' Font size - 11
Private Const LEFT_WRAP_TEXT As Boolean = True     ' Wrap text - True
Private Const LEFT_H_ALIGN As Long = -4131         ' Horizontal alignment (xlLeft) - -4131
Private Const LEFT_V_ALIGN As Long = -4108         ' Vertical alignment (xlCenter) - -4108

' Middle section header formatting
Private Const MIDDLE_HDR_FONT_SIZE As Integer = 12 ' Header font size - 12
Private Const MIDDLE_HDR_BOLD As Boolean = True     ' Header bold - True
Private Const MIDDLE_HDR_FONT_COLOR As Long = 16777215 ' Header font color (white) - 16777215
Private Const MIDDLE_HDR_BG_COLOR As Long = 4136713 ' Header background (#091F3F) - 4136713
Private Const MIDDLE_HDR_H_ALIGN As Long = -4108   ' Header horizontal alignment (xlCenter) - -4108
Private Const MIDDLE_HDR_V_ALIGN As Long = -4107   ' Header vertical alignment (xlBottom) - -4107
Private Const MIDDLE_HDR_WRAP_TEXT As Boolean = False ' Header wrap text - False
Private Const MIDDLE_HDR_ORIENTATION As Integer = 90 ' Header text orientation (degrees) - 90

' Middle section data formatting
Private Const MIDDLE_COL_WIDTH As Double = 7       ' Column width - 7
Private Const MIDDLE_DATA_FONT_SIZE As Integer = 11 ' Font size - 11
Private Const MIDDLE_WRAP_TEXT As Boolean = True   ' Wrap text - False
Private Const MIDDLE_H_ALIGN As Long = -4108       ' Horizontal alignment (xlCenter) - -4108
Private Const MIDDLE_V_ALIGN As Long = -4108       ' Vertical alignment (xlCenter) - -4108

' Right section header formatting
Private Const RIGHT_HDR_FONT_SIZE As Integer = 12  ' Header font size - 12
Private Const RIGHT_HDR_BOLD As Boolean = True      ' Header bold - True
Private Const RIGHT_HDR_FONT_COLOR As Long = 16777215 ' Header font color (white) - 16777215
Private Const RIGHT_HDR_BG_COLOR As Long = 4136713 ' Header background (#091F3F) - 4136713
Private Const RIGHT_HDR_H_ALIGN As Long = -4108    ' Header horizontal alignment (xlCenter) - -4108
Private Const RIGHT_HDR_V_ALIGN As Long = -4108    ' Header vertical alignment (xlCenter) - -4108
Private Const RIGHT_HDR_WRAP_TEXT As Boolean = False ' Header wrap text - False
Private Const RIGHT_HDR_ORIENTATION As Integer = 0 ' Header text orientation (degrees) - 0

' Right section data formatting
Private Const RIGHT_COL_WIDTH As Double = 40       ' Column width - 40
Private Const RIGHT_DATA_FONT_SIZE As Integer = 11 ' Font size - 11
Private Const RIGHT_WRAP_TEXT As Boolean = True    ' Wrap text - True
Private Const RIGHT_H_ALIGN As Long = -4131        ' Horizontal alignment (xlLeft) - -4131
Private Const RIGHT_V_ALIGN As Long = -4108        ' Vertical alignment (xlCenter) - -4108
'------------------------------------------------------------------------------
' COLUMN DEFINITIONS
'
' These arrays define which source columns appear in the PDF and their order.
' Column names MUST exactly match the header text in your source data table.
'
' - LEFT_COLS:   displayed with normal horizontal text, wider columns (left side)
' - MIDDLE_COLS: displayed with vertically-rotated text, narrow columns (center)
' - RIGHT_COLS:  displayed with normal horizontal text, wider columns (right side)
'------------------------------------------------------------------------------
Private Function GetLeftColumns() As Variant
    GetLeftColumns = Array( _
        "Product/ Brand", _
        "Brand Style" _
    )
End Function
Private Function GetMiddleColumns() As Variant
    GetMiddleColumns = Array( _
        "Serving Size", _
        "ABV", _
        "Total Calories", _
        "Total Fat (g)", _
        "Calories from Fat", _
        "Saturated Fat (g)", _
        "Trans Fat (g)", _
        "Cholesterol (mg)", _
        "Sodium (mg)", _
        "Total Carbohydrates (g)", _
        "Dietary Fiber (g)", _
        "Total Sugars (g)", _
        "Protein (g)" _
    )
End Function
Private Function GetRightColumns() As Variant
    GetRightColumns = Array( _
        "Ingredients" _
    )
End Function
Private Function GetDisplayName(ByVal srcName As String) As String
    Select Case srcName
        Case "Product/ Brand": GetDisplayName = "Brand"
        Case "Ingredients":    GetDisplayName = "Ingredients and Fermentations Sources"
        Case Else:             GetDisplayName = srcName
    End Select
End Function
'==============================================================================
' MAIN ENTRY POINT - Assign this macro to a button
'==============================================================================
Public Sub ExportTableToPDF()
    Dim originalWs As Worksheet
    Dim srcWs As Worksheet
    Dim tmpWs As Worksheet
    Dim leftCols As Variant
    Dim middleCols As Variant
    Dim rightCols As Variant
    Dim allOutputCols As Variant
    Dim srcData As Variant
    Dim includeColIdx As Long
    Dim colMap() As Long
    Dim filteredData() As Variant
    Dim filteredCount As Long
    Dim totalOutputCols As Long
    Dim pdfPath As String
    Dim i As Long, j As Long
    Set originalWs = ActiveSheet
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    On Error GoTo ErrorHandler
    '--------------------------------------------------------------------------
    ' 1. Validate source worksheet exists
    '--------------------------------------------------------------------------
    Set srcWs = Nothing
    On Error Resume Next
    Set srcWs = ThisWorkbook.Worksheets(SOURCE_SHEET_NAME)
    On Error GoTo ErrorHandler
    If srcWs Is Nothing Then
        MsgBox "Source worksheet '" & SOURCE_SHEET_NAME & "' not found." & vbCrLf & _
               "Please ensure your data is on a sheet named '" & SOURCE_SHEET_NAME & "'.", _
               vbExclamation, "Export to PDF"
        GoTo Cleanup
    End If
    '--------------------------------------------------------------------------
    ' 2. Load column definitions
    '--------------------------------------------------------------------------
    leftCols = GetLeftColumns()
    middleCols = GetMiddleColumns()
    rightCols = GetRightColumns()
    totalOutputCols = (UBound(leftCols) - LBound(leftCols) + 1) + _
                      (UBound(middleCols) - LBound(middleCols) + 1) + _
                      (UBound(rightCols) - LBound(rightCols) + 1)
    ' Build a combined array of all output column names (in order)
    ReDim allOutputCols(0 To totalOutputCols - 1)
    Dim idx As Long: idx = 0
    For i = LBound(leftCols) To UBound(leftCols)
        allOutputCols(idx) = leftCols(i): idx = idx + 1
    Next i
    For i = LBound(middleCols) To UBound(middleCols)
        allOutputCols(idx) = middleCols(i): idx = idx + 1
    Next i
    For i = LBound(rightCols) To UBound(rightCols)
        allOutputCols(idx) = rightCols(i): idx = idx + 1
    Next i
    '--------------------------------------------------------------------------
    ' 3. Read source data into an array using the defined table range
    '--------------------------------------------------------------------------
    Dim lastRow As Long
    Dim startColNum As Long
    Dim endColNum As Long
    Dim tableRange As Range
    ' Convert column letters to numbers
    startColNum = srcWs.Range(TABLE_START_COL & "1").Column
    endColNum = srcWs.Range(TABLE_END_COL & "1").Column
    ' Find last row with data in the end column (Include column)
    lastRow = srcWs.Cells(srcWs.Rows.Count, endColNum).End(xlUp).row

    If lastRow < TABLE_START_ROW + 1 Then
        MsgBox "No data rows found in the source table." & vbCrLf & _
               "Expected data starting at row " & TABLE_START_ROW + 1 & " in column " & TABLE_END_COL & ".", _
               vbExclamation, "Export to PDF"
        GoTo Cleanup
    End If
    ' Build range: e.g. "B9:K150"
    Set tableRange = srcWs.Range( _
        TABLE_START_COL & TABLE_START_ROW & ":" & TABLE_END_COL & lastRow)
    srcData = tableRange.Value
    '--------------------------------------------------------------------------
    ' 4. Find the "Include" column index in the source data
    '--------------------------------------------------------------------------
    includeColIdx = 0
    For j = 1 To UBound(srcData, 2)
        If UCase(Trim(CStr(srcData(1, j)))) = "INCLUDE" Then
            includeColIdx = j
            Exit For
        End If
    Next j
    If includeColIdx = 0 Then
        MsgBox "Could not find an 'Include' column in the source data headers." & vbCrLf & _
               "Please ensure there is a column named 'Include'.", _
               vbExclamation, "Export to PDF"
        GoTo Cleanup
    End If
    '--------------------------------------------------------------------------
    ' 5. Map output column names to source column indices
    '--------------------------------------------------------------------------
    ReDim colMap(0 To totalOutputCols - 1)
    Dim colName As String
    Dim found As Boolean
    For i = 0 To totalOutputCols - 1
        colName = UCase(Trim(CStr(allOutputCols(i))))
        found = False
        For j = 1 To UBound(srcData, 2)
            If UCase(Trim(CStr(srcData(1, j)))) = colName Then
                colMap(i) = j
                found = True
                Exit For
            End If
        Next j
        If Not found Then
            MsgBox "Column '" & allOutputCols(i) & "' not found in source data headers." & vbCrLf & _
                   "Please check column names in the macro configuration.", _
                   vbExclamation, "Export to PDF"
            GoTo Cleanup
        End If
    Next i
    '--------------------------------------------------------------------------
    ' 6. Filter rows where Include = "Yes"
    '--------------------------------------------------------------------------
    ' First pass: count matching rows
    filteredCount = 0
    For i = 2 To UBound(srcData, 1)
        If UCase(Trim(CStr(srcData(i, includeColIdx)))) = "YES" Then
            filteredCount = filteredCount + 1
        End If
    Next i
    If filteredCount = 0 Then
        MsgBox "No rows with Include = 'Yes' were found.", vbInformation, "Export to PDF"
        GoTo Cleanup
    End If
    ' Second pass: extract matching data
    ReDim filteredData(1 To filteredCount, 1 To totalOutputCols)
    Dim row As Long: row = 0
    For i = 2 To UBound(srcData, 1)
        If UCase(Trim(CStr(srcData(i, includeColIdx)))) = "YES" Then
            row = row + 1
            For j = 0 To totalOutputCols - 1
                filteredData(row, j + 1) = srcData(i, colMap(j))
            Next j
        End If
    Next i
    ' 7. Create temporary worksheet and write all table data
    '--------------------------------------------------------------------------
    Set tmpWs = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    tmpWs.Name = "PDF_Export_Temp_" & Format(Now, "hhmmss")

    Dim tableStartRow As Long
    Dim leftCount As Long, middleCount As Long, rightCount As Long
    leftCount = UBound(leftCols) - LBound(leftCols) + 1
    middleCount = UBound(middleCols) - LBound(middleCols) + 1
    rightCount = UBound(rightCols) - LBound(rightCols) + 1

    '-- Top spacer (Row 1) - pushes title below page header --
    '-- Title (Row 2) --
    tmpWs.Cells(2, 1).Value = PDF_TITLE
    tmpWs.Range(tmpWs.Cells(2, 1), tmpWs.Cells(2, totalOutputCols)).Merge

    '-- Description (Rows 3-4, merged) --
    tmpWs.Cells(3, 1).Value = PDF_DESCRIPTION
    tmpWs.Range(tmpWs.Cells(3, 1), tmpWs.Cells(4, totalOutputCols)).Merge

    '-- Table starts at row 6 (row 5 is a spacer) --
    tableStartRow = 6

    '-- Write table headers --
    For j = 0 To totalOutputCols - 1
        tmpWs.Cells(tableStartRow, j + 1).Value = GetDisplayName(CStr(allOutputCols(j)))
    Next j

    '-- Write filtered data rows --
    Dim dataStartRow As Long
    dataStartRow = tableStartRow + 1

    For i = 1 To filteredCount
        For j = 1 To totalOutputCols
            tmpWs.Cells(dataStartRow + i - 1, j).Value = filteredData(i, j)
        Next j
    Next i

    '--------------------------------------------------------------------------
    ' 8. Apply all formatting
    '--------------------------------------------------------------------------
    Dim dataEndRow As Long
    dataEndRow = dataStartRow + filteredCount - 1

    '-- Top spacer row --
    tmpWs.Rows(1).RowHeight = TITLE_TOP_SPACER

    '-- Title formatting --
    With tmpWs.Cells(2, 1)
        .Font.Size = TITLE_FONT_SIZE
        .Font.Bold = True
        .Font.Color = RGB(0, 0, 0)
        .VerticalAlignment = xlBottom
    End With
    tmpWs.Rows(2).RowHeight = 36

    '-- Description formatting --
    With tmpWs.Cells(3, 1)
        .Font.Size = DESC_FONT_SIZE
        .Font.Color = RGB(80, 80, 80)
        .WrapText = True
        .VerticalAlignment = xlTop
    End With
    tmpWs.Rows(3).RowHeight = 30
    tmpWs.Rows(4).RowHeight = 30

    '-- Spacer row --
    tmpWs.Rows(5).RowHeight = 6

    '-- Left section header formatting --
    For j = 1 To leftCount
        With tmpWs.Cells(tableStartRow, j)
            .Font.Size = LEFT_HDR_FONT_SIZE
            .Font.Bold = LEFT_HDR_BOLD
            .Font.Color = LEFT_HDR_FONT_COLOR
            .Interior.Color = LEFT_HDR_BG_COLOR
            .HorizontalAlignment = LEFT_HDR_H_ALIGN
            .VerticalAlignment = LEFT_HDR_V_ALIGN
            .WrapText = LEFT_HDR_WRAP_TEXT
            .Orientation = LEFT_HDR_ORIENTATION
        End With
    Next j

    '-- Middle section header formatting --
    Dim middleStartCol As Long
    middleStartCol = leftCount + 1
    For j = middleStartCol To middleStartCol + middleCount - 1
        With tmpWs.Cells(tableStartRow, j)
            .Font.Size = MIDDLE_HDR_FONT_SIZE
            .Font.Bold = MIDDLE_HDR_BOLD
            .Font.Color = MIDDLE_HDR_FONT_COLOR
            .Interior.Color = MIDDLE_HDR_BG_COLOR
            .HorizontalAlignment = MIDDLE_HDR_H_ALIGN
            .VerticalAlignment = MIDDLE_HDR_V_ALIGN
            .WrapText = MIDDLE_HDR_WRAP_TEXT
            .Orientation = MIDDLE_HDR_ORIENTATION
        End With
    Next j

    '-- Right section header formatting --
    Dim rightHdrStartCol As Long
    rightHdrStartCol = leftCount + middleCount + 1
    For j = rightHdrStartCol To rightHdrStartCol + rightCount - 1
        With tmpWs.Cells(tableStartRow, j)
            .Font.Size = RIGHT_HDR_FONT_SIZE
            .Font.Bold = RIGHT_HDR_BOLD
            .Font.Color = RIGHT_HDR_FONT_COLOR
            .Interior.Color = RIGHT_HDR_BG_COLOR
            .HorizontalAlignment = RIGHT_HDR_H_ALIGN
            .VerticalAlignment = RIGHT_HDR_V_ALIGN
            .WrapText = RIGHT_HDR_WRAP_TEXT
            .Orientation = RIGHT_HDR_ORIENTATION
        End With
    Next j

    tmpWs.Rows(tableStartRow).RowHeight = HEADER_ROW_HEIGHT

   '-- Left section data formatting --
    For j = 1 To leftCount
        tmpWs.Columns(j).ColumnWidth = LEFT_COL_WIDTH
        With tmpWs.Range(tmpWs.Cells(dataStartRow, j), tmpWs.Cells(dataEndRow, j))
            .Font.Size = LEFT_DATA_FONT_SIZE
            .WrapText = LEFT_WRAP_TEXT
            .HorizontalAlignment = LEFT_H_ALIGN
            .VerticalAlignment = LEFT_V_ALIGN
        End With
    Next j

    '-- Middle section data formatting --
    For j = middleStartCol To middleStartCol + middleCount - 1
        tmpWs.Columns(j).ColumnWidth = MIDDLE_COL_WIDTH
        With tmpWs.Range(tmpWs.Cells(dataStartRow, j), tmpWs.Cells(dataEndRow, j))
            .Font.Size = MIDDLE_DATA_FONT_SIZE
            .WrapText = MIDDLE_WRAP_TEXT
            .HorizontalAlignment = MIDDLE_H_ALIGN
            .VerticalAlignment = MIDDLE_V_ALIGN
        End With
    Next j

    '-- Right section data formatting --
    Dim rightStartCol As Long
    rightStartCol = leftCount + middleCount + 1
    For j = rightStartCol To rightStartCol + rightCount - 1
        tmpWs.Columns(j).ColumnWidth = RIGHT_COL_WIDTH
        With tmpWs.Range(tmpWs.Cells(dataStartRow, j), tmpWs.Cells(dataEndRow, j))
            .Font.Size = RIGHT_DATA_FONT_SIZE
            .WrapText = RIGHT_WRAP_TEXT
            .HorizontalAlignment = RIGHT_H_ALIGN
            .VerticalAlignment = RIGHT_V_ALIGN
        End With
    Next j

    '-- Auto-fit data row heights (must run after fonts, wrap, and widths are set) --
    tmpWs.Range(tmpWs.Cells(dataStartRow, 1), tmpWs.Cells(dataEndRow, totalOutputCols)).EntireRow.AutoFit

    ' Enforce minimum row height so short rows don't get too compact
    For i = dataStartRow To dataEndRow
        If tmpWs.Rows(i).RowHeight < MIN_DATA_ROW_HEIGHT Then
            tmpWs.Rows(i).RowHeight = MIN_DATA_ROW_HEIGHT
        End If
    Next i

    '-- Alternating row colors --
    For i = dataStartRow To dataEndRow
        If (i - dataStartRow) Mod 2 = 1 Then
            tmpWs.Range(tmpWs.Cells(i, 1), tmpWs.Cells(i, totalOutputCols)).Interior.Color = ALT_ROW_COLOR
        End If
    Next i

    '-- Table borders --
    With tmpWs.Range(tmpWs.Cells(tableStartRow, 1), tmpWs.Cells(dataEndRow, totalOutputCols))
        .Borders(xlEdgeLeft).LineStyle = xlContinuous
        .Borders(xlEdgeLeft).Weight = xlThin
        .Borders(xlEdgeRight).LineStyle = xlContinuous
        .Borders(xlEdgeRight).Weight = xlThin
        .Borders(xlEdgeTop).LineStyle = xlContinuous
        .Borders(xlEdgeTop).Weight = xlThin
        .Borders(xlEdgeBottom).LineStyle = xlContinuous
        .Borders(xlEdgeBottom).Weight = xlThin
        .Borders(xlInsideVertical).LineStyle = xlContinuous
        .Borders(xlInsideVertical).Weight = xlHairline
        .Borders(xlInsideVertical).Color = RGB(180, 180, 180)
        .Borders(xlInsideHorizontal).LineStyle = xlContinuous
        .Borders(xlInsideHorizontal).Weight = xlHairline
        .Borders(xlInsideHorizontal).Color = RGB(180, 180, 180)
    End With

    ' Thicker border below header row
    With tmpWs.Range(tmpWs.Cells(tableStartRow, 1), tmpWs.Cells(tableStartRow, totalOutputCols))
        .Borders(xlEdgeBottom).LineStyle = xlContinuous
        .Borders(xlEdgeBottom).Weight = xlMedium
        .Borders(xlEdgeBottom).Color = RGB(0, 0, 0)
    End With
    '--------------------------------------------------------------------------
    ' 9. Page setup: landscape, headers, margins, print area
    '--------------------------------------------------------------------------
    With tmpWs.PageSetup
        .Orientation = xlLandscape
        .PaperSize = xlPaperLetter
        ' "Updated: MM/dd/YYYY" in top-right of every page
        .RightHeader = "Updated: " & Format(Date, "MM/dd/YYYY")
        .RightHeaderPicture.Filename = ""  ' no picture
        ' Clear other header/footer sections
        .LeftHeader = ""
        .CenterHeader = ""
        .LeftFooter = "*Not HFCS, Not present in the final product" & Chr(10) & ChrW(8224) & " Gluten-Free"
        .CenterFooter = ""
        .RightFooter = "Page &P of &N"
        ' Margins (inches)
        .TopMargin = Application.InchesToPoints(0.75)
        .BottomMargin = Application.InchesToPoints(0.9)
        .LeftMargin = Application.InchesToPoints(0.12)
        .RightMargin = Application.InchesToPoints(0.12)
        .HeaderMargin = Application.InchesToPoints(0.3)
        .FooterMargin = Application.InchesToPoints(0.5)
        ' Fit all columns on one page width, let rows flow to multiple pages
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        ' Print title rows: repeat the table header row on every page
        .PrintTitleRows = "$" & tableStartRow & ":$" & tableStartRow
        ' Set the print area
        .PrintArea = tmpWs.Range(tmpWs.Cells(1, 1), tmpWs.Cells(dataEndRow, totalOutputCols)).Address
    End With
    '--------------------------------------------------------------------------
    ' 10. Handle first-page-only title/description via page break
    '--------------------------------------------------------------------------
    ' The title and description (rows 1-5) only appear because they are above
    ' the table. Since PrintTitleRows repeats only the header row (row 6),
    ' subsequent pages will NOT show the title/description - they will show
    ' only the table header row and data. This achieves "title on first page only."
    '--------------------------------------------------------------------------
    ' 11. Prompt for save location and export to PDF
    '--------------------------------------------------------------------------
    If DEFAULT_PDF_PATH <> "" Then
        pdfPath = DEFAULT_PDF_PATH
    Else
        pdfPath = Application.GetSaveAsFilename( _
            InitialFileName:=ThisWorkbook.Path & "\" & _
                Replace(PDF_TITLE, " ", "_") & "_" & Format(Date, "YYYY-MM-DD") & ".pdf", _
            FileFilter:="PDF Files (*.pdf), *.pdf", _
            Title:="Save PDF Export As")
    End If
    If pdfPath = "False" Or pdfPath = "" Then
        MsgBox "Export cancelled.", vbInformation, "Export to PDF"
        GoTo DeleteTempSheet
    End If
    ' Export
    tmpWs.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        Filename:=pdfPath, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, _
        OpenAfterPublish:=True
    MsgBox "PDF exported successfully!" & vbCrLf & vbCrLf & pdfPath, _
           vbInformation, "Export to PDF"
DeleteTempSheet:
    '--------------------------------------------------------------------------
    ' 12. Clean up - delete the temporary worksheet
    '--------------------------------------------------------------------------
    Application.DisplayAlerts = False
    tmpWs.Delete
    Application.DisplayAlerts = True
Cleanup:
    If Not originalWs Is Nothing Then originalWs.Activate
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Exit Sub
ErrorHandler:
    MsgBox "An error occurred during PDF export:" & vbCrLf & vbCrLf & _
           "Error " & Err.Number & ": " & Err.Description, _
           vbCritical, "Export to PDF"
    ' Attempt to clean up the temp sheet if it was created
    If Not tmpWs Is Nothing Then
        Application.DisplayAlerts = False
        On Error Resume Next
        tmpWs.Delete
        On Error GoTo 0
        Application.DisplayAlerts = True
    End If
    Resume Cleanup
End Sub
