function createProfileController({ db }) {
  return {
    roleSkills: async (req, res) => {
      try { res.json(await db.searchRolesAndSkills(req.query.q || '')); }
      catch (err) { console.error('Role & skills lookup error:', err.message); res.status(500).json({ error: { message: 'Failed to retrieve roles and skills.' } }); }
    }
  };
}

module.exports = { createProfileController };
