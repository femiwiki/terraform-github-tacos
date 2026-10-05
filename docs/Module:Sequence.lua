-- The order of the pages, read from MediaWiki:Sidebar, so it is written down once.
-- Adapted from wikven's own docs (chaotic-ground/wikven, docs/Module:Sequence.lua).
local p = {}

-- "** Page|Label"; an entry linking outside the site has "://" and is skipped
local ENTRY = '^%*%*%s*([^|\n]+)|([^\n]+)'

local function sequence()
	local content = mw.title.new('MediaWiki:Sidebar'):getContent() or ''
	local pages = {}
	for line in mw.text.gsplit(content, '\n') do
		local page, label = line:match(ENTRY)
		if page and not page:find('://', 1, true) then
			pages[#pages + 1] = { page = mw.text.trim(page), label = mw.text.trim(label) }
		end
	end
	if #pages == 0 then
		error('MediaWiki:Sidebar has no "** Page|Label" entries', 0)
	end
	return pages
end

local function link(entry, before, after)
	return before .. '[[' .. entry.page .. '|' .. entry.label .. ']]' .. after
end

-- A previous link, a next link, or both; nothing on a page the sidebar does not name
function p.row()
	local pages = sequence()
	local here = mw.title.getCurrentTitle().text
	local out = {}
	for i, entry in ipairs(pages) do
		if entry.page == here then
			if pages[i - 1] then
				out[#out + 1] = '<div class="tacos-prevnext-prev">' .. link(pages[i - 1], '&larr;&nbsp;', '') .. '</div>'
			end
			if pages[i + 1] then
				out[#out + 1] = '<div class="tacos-prevnext-next">' .. link(pages[i + 1], '', '&nbsp;&rarr;') .. '</div>'
			end
			break
		end
	end
	return table.concat(out)
end

return p
