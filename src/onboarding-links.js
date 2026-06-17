// Per-file OneDrive deep links for the induction pack.
//
// Keyed by the REF path with the PACK_ROOT ("NA Sales/Enablement/Onboarding/")
// prefix stripped — i.e. parseRef(...).ref.rel in don-onboarding.jsx. Any REF
// not listed here falls back to PACK_FOLDER_URL (the shared pack folder).
//
// Captured from the SharePoint REST API (read-only): each file's canonical
// link is "<server-relative path>?d=w<UniqueId without dashes>", the same form
// SharePoint's own LinkingUrl uses. These open the file for anyone who already
// has access to the shared pack folder (Don + managers); they create no new
// sharing grant. Regenerate when the master pack files change.
window.ONBOARDING_LINKS = {
  "1-Start-Here/Don-Core-Product-Lines_2026-06-09.docx":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/1-Start-Here/Don-Core-Product-Lines_2026-06-09.docx?d=w3e87eea05c32483883ccd7077ff490d5",
  "2-Product-Collateral/Custom learning design.pdf":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/2-Product-Collateral/Custom%20learning%20design.pdf?d=w590d7eab7407465ca57e05e610b87f06",
  "2-Product-Collateral/Learning Services.pdf":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/2-Product-Collateral/Learning%20Services.pdf?d=w9bd3919079784278b3c640d38cf417f8",
  "2-Product-Collateral/M Suite tiered offering - Long version.pdf":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/2-Product-Collateral/M%20Suite%20tiered%20offering%20-%20Long%20version.pdf?d=wb692b1839c03443181d6b7ea27949a1d",
  "3-Competitor-Battlecards/Cornerstone Battlecard 2025 .pdf":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/3-Competitor-Battlecards/Cornerstone%20Battlecard%202025%20.pdf?d=w4f248b9a47d94d36897e616abe9dba2e",
  "4-Totara-Sales-Decks/Totara Suite sales preview or demo intro v1 October 2024.pptx":
    "https://mindtoolsltd-my.sharepoint.com/personal/jhamons_mindtools_com/Documents/NA%20Sales/Enablement/Onboarding/4-Totara-Sales-Decks/Totara%20Suite%20sales%20preview%20or%20demo%20intro%20v1%20October%202024.pptx?d=w88e1660423a745a98a2ee9f8bd1c6a0c",
};
