/* Safar Electrified
   Trips, costs, photos, and page text come from content/safar-electrified.xlsx.

   Live updates from Google Sheets (recommended):
   1. Upload that Excel file to Google Drive and open it with Google Sheets.
   2. Share → Anyone with the link → Viewer.
   3. Copy the Sheet ID from the URL:
      https://docs.google.com/spreadsheets/d/THIS_PART/edit
   4. Paste it below, then upload the site once more.
   After that, edit the sheet only. Refresh the site to see new trips.

   Tab names must stay: Settings, Trips, Stops, Costs, Changes, Problems, Gallery
*/
window.SAFAR_CONFIG = {
  googleSheetId: "",
  siteUrl: "https://safar-electrified.com",
};
