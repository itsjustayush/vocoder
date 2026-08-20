function classifyRisk(command) {
  const text = String(command).toLowerCase();
  const destructive = /(rm\s+-rf|rmdir|del\s+\/|format\s+|shutdown|restart-computer|stop-computer|remove-item|drop\s+database|git\s+reset\s+--hard|npm\s+uninstall\s+-g|killall|taskkill|chmod\s+777|curl.+\|\s*(sh|bash)|invoke-webrequest.+-outfile)/i.test(text);
  const external = /(send|post|publish|upload|message|email|tweet|telegram|payment|buy|install|uninstall|delete|remove|overwrite|move|rename)/i.test(text);
  return { destructive, external, requiresConfirmation: destructive || external };
}

module.exports = { classifyRisk };
