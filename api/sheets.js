const { google } = require('googleapis');

const SHEET_ID = process.env.VITE_SHEET_ID;

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const { action, payload } = req.body || {};

    // ── CHECKOUT ─────────────────────────────────────────────────────────────
    if (action === 'checkout') {
      const { playerId, cart } = payload;

      // Read players
      const playersRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Players!A:D'
      });
      const playerRows = playersRes.data.values || [];
      const playerRowIndex = playerRows.findIndex(r => String(r[0]) === String(playerId));
      if (playerRowIndex === -1) return res.status(400).json({ success: false, message: 'Player not found' });
      const playerRow = playerRows[playerRowIndex];
      const gold = Number(playerRow[3]);

      // Read inventory
      const invRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Inventory!A:G'
      });
      const invRows = invRes.data.values || [];

      // Calculate total and validate stock
      let total = 0;
      for (const item of cart) {
        const invRowIndex = invRows.findIndex(r => String(r[0]) === String(item.id));
        if (invRowIndex === -1) return res.status(400).json({ success: false, message: 'Item not found' });
        const price = Number(invRows[invRowIndex][3]);
        const stock = Number(invRows[invRowIndex][4]);
        if (item.qty > stock) return res.status(400).json({ success: false, message: `${invRows[invRowIndex][1]} is out of stock` });
        total += price * item.qty;
      }

      if (total > gold) return res.status(400).json({ success: false, message: 'Not enough gold!' });

      // Deduct player gold
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Players!D${playerRowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[gold - total]] }
      });

      // Deduct stock and log purchases
      const timestamp = new Date().toLocaleString();
      for (const item of cart) {
        const invRowIndex = invRows.findIndex(r => String(r[0]) === String(item.id));
        const currentStock = Number(invRows[invRowIndex][4]);
        const price = Number(invRows[invRowIndex][3]);

        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Inventory!E${invRowIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[currentStock - item.qty]] }
        });

        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Log!A:F',
          valueInputOption: 'RAW',
          requestBody: { values: [[timestamp, playerRow[2], invRows[invRowIndex][1], item.qty, price * item.qty, gold - total]] }
        });
      }

      return res.status(200).json({ success: true, goldAfter: gold - total, total, character: playerRow[2] });
    }

    // ── UPDATE PLAYER ─────────────────────────────────────────────────────────
    if (action === 'updatePlayer') {
      const { id, player, character, gold } = payload;
      const playersRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Players!A:D'
      });
      const rows = playersRes.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === String(id));
      if (rowIndex === -1) return res.status(400).json({ success: false });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Players!B${rowIndex + 1}:D${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[player, character, gold]] }
      });
      return res.status(200).json({ success: true });
    }

    // ── ADD PLAYER ────────────────────────────────────────────────────────────
    if (action === 'addPlayer') {
      const { player, character, gold } = payload;
      const id = Date.now();
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Players!A:D',
        valueInputOption: 'RAW',
        requestBody: { values: [[id, player, character, gold]] }
      });
      return res.status(200).json({ success: true, id });
    }

    // ── DELETE PLAYER ─────────────────────────────────────────────────────────
    if (action === 'deletePlayer') {
      const { id } = payload;
      const playersRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Players!A:D'
      });
      const rows = playersRes.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === String(id));
      if (rowIndex === -1) return res.status(400).json({ success: false });

      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const playersSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'Players');
      const sheetId = playersSheet.properties.sheetId;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }]
        }
      });
      return res.status(200).json({ success: true });
    }

    // ── UPDATE ITEM ───────────────────────────────────────────────────────────
    if (action === 'updateItem') {
      const { id, name, category, price, stock, desc, available } = payload;
      const invRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Inventory!A:G'
      });
      const rows = invRes.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === String(id));
      if (rowIndex === -1) return res.status(400).json({ success: false });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Inventory!B${rowIndex + 1}:G${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[name, category, price, stock, desc, available ? 'YES' : 'NO']] }
      });
      return res.status(200).json({ success: true });
    }

    // ── ADD ITEM ──────────────────────────────────────────────────────────────
    if (action === 'addItem') {
      const { name, category, price, stock, desc } = payload;
      const id = Date.now();
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Inventory!A:G',
        valueInputOption: 'RAW',
        requestBody: { values: [[id, name, category, price, stock, desc, 'YES']] }
      });
      return res.status(200).json({ success: true, id });
    }

    // ── DELETE ITEM ───────────────────────────────────────────────────────────
    if (action === 'deleteItem') {
      const { id } = payload;
      const invRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Inventory!A:G'
      });
      const rows = invRes.data.values || [];
      const rowIndex = rows.findIndex(r => String(r[0]) === String(id));
      if (rowIndex === -1) return res.status(400).json({ success: false });

      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const invSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'Inventory');
      const sheetId = invSheet.properties.sheetId;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } } }]
        }
      });
      return res.status(200).json({ success: true });
    }

    // ── UPDATE CHAR INVENTORY ─────────────────────────────────────────────────
    if (action === 'updateCharInventory') {
      const { playerId, items } = payload;
      const charInvRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'CharInventory!A:E'
      });
      const rows = charInvRes.data.values || [];

      // Get sheet ID for deletes
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const charInvSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'CharInventory');
      const sheetId = charInvSheet.properties.sheetId;

      // Delete all rows for this player (except header)
      const playerRowIndices = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => i > 0 && String(r[0]) === String(playerId))
        .map(({ i }) => i)
        .reverse();

      for (const idx of playerRowIndices) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }]
          }
        });
      }

      // Re-append all items for this player
      if (items.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'CharInventory!A:E',
          valueInputOption: 'RAW',
          requestBody: { values: items.map(i => [playerId, i.name, i.qty, i.desc, i.category]) }
        });
      }

      return res.status(200).json({ success: true });
    }

    // ── CLEAR LOG ─────────────────────────────────────────────────────────────
    if (action === 'clearLog') {
      const logRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Log!A:F'
      });
      const rows = logRes.data.values || [];
      if (rows.length > 1) {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
        const logSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'Log');
        const sheetId = logSheet.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rows.length } } }]
          }
        });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, message: 'Unknown action' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
