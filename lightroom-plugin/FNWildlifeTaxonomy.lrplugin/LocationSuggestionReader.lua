local LrExportSession = import "LrExportSession"
local LrFileUtils = import "LrFileUtils"
local LrProgressScope = import "LrProgressScope"
local LrTasks = import "LrTasks"

local LocationSuggestionReader = {}

local function cleanText(value)
  local text = tostring(value or "")
  return string.match(text, "^%s*(.-)%s*$") or ""
end

local function utf8Character(code)
  if not code or code < 0 or code > 1114111 then
    return ""
  end
  if code <= 127 then
    return string.char(code)
  end
  if code <= 2047 then
    return string.char(192 + math.floor(code / 64), 128 + (code % 64))
  end
  if code <= 65535 then
    return string.char(
      224 + math.floor(code / 4096),
      128 + (math.floor(code / 64) % 64),
      128 + (code % 64)
    )
  end
  return string.char(
    240 + math.floor(code / 262144),
    128 + (math.floor(code / 4096) % 64),
    128 + (math.floor(code / 64) % 64),
    128 + (code % 64)
  )
end

local function decodeXml(value)
  local text = tostring(value or "")
  text = string.gsub(text, "&#x([%x]+);", function(code)
    return utf8Character(tonumber(code, 16))
  end)
  text = string.gsub(text, "&#(%d+);", function(code)
    return utf8Character(tonumber(code, 10))
  end)
  text = string.gsub(text, "&quot;", '"')
  text = string.gsub(text, "&apos;", "'")
  text = string.gsub(text, "&lt;", "<")
  text = string.gsub(text, "&gt;", ">")
  text = string.gsub(text, "&amp;", "&")
  return cleanText(text)
end

local function xmlNamePattern(name)
  return string.gsub(name, "([^%w])", "%%%1")
end

local function xmpValue(data, names)
  for _, name in ipairs(names) do
    local escapedName = xmlNamePattern(name)
    local value = string.match(data, escapedName .. '%s*=%s*"(.-)"')
      or string.match(data, escapedName .. "%s*=%s*'(.-)'")
      or string.match(data, "<%s*" .. escapedName .. "[^>]*>(.-)</%s*" .. escapedName .. "%s*>")
    value = decodeXml(value)
    if value ~= "" and not string.find(value, "<", 1, true) then
      return value
    end
  end
  return ""
end

local function jpegApp13Segments(data)
  local segments = {}
  if string.byte(data, 1) ~= 255 or string.byte(data, 2) ~= 216 then
    return segments
  end
  local position = 3
  while position <= string.len(data) - 3 do
    if string.byte(data, position) ~= 255 then
      position = position + 1
    else
      while string.byte(data, position) == 255 do
        position = position + 1
      end
      local marker = string.byte(data, position)
      position = position + 1
      if marker == 217 or marker == 218 then
        break
      end
      if marker and not (marker >= 208 and marker <= 215) and marker ~= 1 then
        local high = string.byte(data, position)
        local low = string.byte(data, position + 1)
        if not high or not low then
          break
        end
        local length = high * 256 + low
        if length < 2 or position + length - 1 > string.len(data) then
          break
        end
        if marker == 237 then
          table.insert(segments, string.sub(data, position + 2, position + length - 1))
        end
        position = position + length
      end
    end
  end
  return segments
end

local function iptcValue(segments, dataset)
  local marker = string.char(28, 2, dataset)
  for _, segment in ipairs(segments) do
    local position = 1
    while true do
      local found = string.find(segment, marker, position, true)
      if not found then
        break
      end
      local high = string.byte(segment, found + 3)
      local low = string.byte(segment, found + 4)
      if high and low and high < 128 then
        local length = high * 256 + low
        local valueStart = found + 5
        local valueEnd = valueStart + length - 1
        if valueEnd <= string.len(segment) then
          local value = cleanText(string.sub(segment, valueStart, valueEnd))
          if value ~= "" then
            return value
          end
        end
      end
      position = found + 3
    end
  end
  return ""
end

local function locationValuesFromJpeg(data)
  local app13 = jpegApp13Segments(data)
  return {
    fnLocation = xmpValue(data, { "Iptc4xmpCore:Location", "iptcCore:Location" }),
    fnCity = xmpValue(data, { "photoshop:City" }),
    fnStateProvince = xmpValue(data, { "photoshop:State" }),
    fnCountry = xmpValue(data, { "photoshop:Country" }),
    fnIsoCountryCode = xmpValue(data, {
      "Iptc4xmpCore:CountryCode",
      "iptcCore:CountryCode",
    }),
  }, app13
end

local function fillIptcFallbacks(values, app13)
  if values.fnLocation == "" then
    values.fnLocation = iptcValue(app13, 92)
  end
  if values.fnCity == "" then
    values.fnCity = iptcValue(app13, 90)
  end
  if values.fnStateProvince == "" then
    values.fnStateProvince = iptcValue(app13, 95)
  end
  if values.fnCountry == "" then
    values.fnCountry = iptcValue(app13, 101)
  end
  if values.fnIsoCountryCode == "" then
    values.fnIsoCountryCode = iptcValue(app13, 100)
  end
  return values
end

local function exportSettings(path)
  return {
    LR_exportServiceProvider = "com.adobe.ag.export.file",
    LR_export_destinationType = "specificFolder",
    LR_export_destinationPathPrefix = path,
    LR_export_useSubfolder = false,
    LR_collisionHandling = "rename",
    LR_renamingTokensOn = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 0.1,
    LR_export_colorSpace = "sRGB",
    LR_size_doConstrain = true,
    LR_size_resizeType = "wh",
    LR_size_maxWidth = 64,
    LR_size_maxHeight = 64,
    LR_outputSharpeningOn = false,
    LR_useWatermark = false,
    LR_embeddedMetadataOption = "all",
    LR_minimizeEmbeddedMetadata = false,
    LR_removeLocationMetadata = false,
    LR_export_postProcessing = "doNothing",
    LR_reimportExportedPhoto = false,
  }
end

function LocationSuggestionReader.resolve(photos)
  local selectedPhotos = photos or {}
  local result = {
    valuesByPhoto = {},
    failedByPhoto = {},
    canceled = false,
  }
  if #selectedPhotos == 0 then
    return result
  end

  local operation = require("TempSession").begin("Lightroom-Ortsvorschläge")
  local outputDirectory = operation.root

  local progress = LrProgressScope({
    title = "Lightroom-Ortsvorschläge übernehmen",
    caption = "Kleine temporäre Vorschauen werden ausgewertet ...",
  })
  progress:setCancelable(true)
  local session = LrExportSession({
    photosToExport = selectedPhotos,
    exportSettings = exportSettings(outputDirectory),
  })
  -- Eine programmgesteuerte LrExportSession erzeugt ihre Renditions nicht
  -- allein durch waitForRender(). Der Export muss zuerst ausdrücklich
  -- gestartet werden; die kurze Pause gibt Lightrooms Export-Task Zeit, die
  -- Renditions anzulegen. Diese Reihenfolge entspricht dem bewährten
  -- Commit-Locations-Ablauf von Any Tag.
  local exportOk, exportError = LrTasks.pcall(function()
    session:doExportOnNewTask()
    LrTasks.sleep(0.1)
    for _, rendition in session:renditions({
      progressScope = progress,
      renderProgressPortion = 1,
      -- Even cancellation must finish waiting for started renderers before any
      -- directory can be released. The action remains canceled for the writer.
      stopIfCanceled = false,
    }) do
      local success, pathOrMessage = rendition:waitForRender()
      if success then
        operation:register(pathOrMessage)
        local readOk, data = pcall(LrFileUtils.readFile, pathOrMessage)
        if readOk and type(data) == "string" then
          local values, app13 = locationValuesFromJpeg(data)
          result.valuesByPhoto[rendition.photo] = fillIptcFallbacks(values, app13)
        else
          result.failedByPhoto[rendition.photo] = tostring(data or "Temporäre Vorschau konnte nicht gelesen werden.")
        end
      else
        result.failedByPhoto[rendition.photo] = tostring(pathOrMessage or "Temporärer Export fehlgeschlagen.")
      end
    end
  end)
  result.canceled = progress:isCanceled()
  progress:done()
  if exportOk then
    operation:release()
  else
    -- A thrown SDK error does not prove every renderer stopped. Leave the
    -- lease for process-verified crash/start recovery, never delete beneath it.
    for _, photo in ipairs(selectedPhotos) do
      result.failedByPhoto[photo] = tostring(exportError or "Temporärer Export nicht sicher abgeschlossen.")
    end
  end
  return result
end

return LocationSuggestionReader
