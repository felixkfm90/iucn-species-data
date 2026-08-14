local Json = {}

Json.null = {}

local ESCAPE_ENCODE = {
  ["\b"] = "\\b",
  ["\f"] = "\\f",
  ["\n"] = "\\n",
  ["\r"] = "\\r",
  ["\t"] = "\\t",
  ["\\"] = "\\\\",
  ['"'] = '\\"',
}

local ESCAPE_DECODE = {
  b = "\b",
  f = "\f",
  n = "\n",
  r = "\r",
  t = "\t",
  ["\\"] = "\\",
  ['"'] = '"',
  ["/"] = "/",
}

local function encodeString(value)
  return '"' .. string.gsub(value, '[%z\1-\31\\"]', function(character)
    local escaped = ESCAPE_ENCODE[character]
    if escaped then
      return escaped
    end
    return string.format("\\u%04x", string.byte(character))
  end) .. '"'
end

local function arrayLength(value)
  local count = 0
  local maximum = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      return nil
    end
    count = count + 1
    if key > maximum then
      maximum = key
    end
  end
  if count == 0 or count ~= maximum then
    return nil
  end
  return maximum
end

local function encodeValue(value, parents)
  local valueType = type(value)
  if value == Json.null then
    return "null"
  end
  if valueType == "nil" then
    return "null"
  end
  if valueType == "boolean" then
    return value and "true" or "false"
  end
  if valueType == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      error("JSON kann keine nicht endliche Zahl darstellen.")
    end
    return tostring(value)
  end
  if valueType == "string" then
    return encodeString(value)
  end
  if valueType ~= "table" then
    error("Nicht unterstuetzter JSON-Wert: " .. valueType)
  end
  if parents[value] then
    error("Zyklische Tabellen koennen nicht als JSON geschrieben werden.")
  end
  parents[value] = true

  local parts = {}
  local length = arrayLength(value)
  if length then
    for index = 1, length do
      parts[index] = encodeValue(value[index], parents)
    end
    parents[value] = nil
    return "[" .. table.concat(parts, ",") .. "]"
  end

  local keys = {}
  for key in pairs(value) do
    if type(key) ~= "string" then
      error("JSON-Objektschluessel muessen Zeichenfolgen sein.")
    end
    table.insert(keys, key)
  end
  table.sort(keys)
  for _, key in ipairs(keys) do
    table.insert(parts, encodeString(key) .. ":" .. encodeValue(value[key], parents))
  end
  parents[value] = nil
  return "{" .. table.concat(parts, ",") .. "}"
end

function Json.encode(value)
  return encodeValue(value, {})
end

local function decodeError(state, message)
  error(message .. " (Position " .. tostring(state.position) .. ")")
end

local function skipWhitespace(state)
  while state.position <= state.length do
    local character = string.sub(state.text, state.position, state.position)
    if character ~= " " and character ~= "\n" and character ~= "\r" and character ~= "\t" then
      return
    end
    state.position = state.position + 1
  end
end

local function utf8Character(codepoint)
  if codepoint <= 0x7f then
    return string.char(codepoint)
  end
  if codepoint <= 0x7ff then
    return string.char(
      0xc0 + math.floor(codepoint / 0x40),
      0x80 + (codepoint % 0x40)
    )
  end
  if codepoint <= 0xffff then
    return string.char(
      0xe0 + math.floor(codepoint / 0x1000),
      0x80 + (math.floor(codepoint / 0x40) % 0x40),
      0x80 + (codepoint % 0x40)
    )
  end
  if codepoint <= 0x10ffff then
    return string.char(
      0xf0 + math.floor(codepoint / 0x40000),
      0x80 + (math.floor(codepoint / 0x1000) % 0x40),
      0x80 + (math.floor(codepoint / 0x40) % 0x40),
      0x80 + (codepoint % 0x40)
    )
  end
  error("Ungueltiger Unicode-Codepunkt im JSON.")
end

local function decodeHex(state, first)
  local token = string.sub(state.text, first, first + 3)
  if string.len(token) ~= 4 or not string.match(token, "^%x%x%x%x$") then
    decodeError(state, "Ungueltige Unicode-Escape-Sequenz")
  end
  return tonumber(token, 16)
end

local function parseString(state)
  state.position = state.position + 1
  local parts = {}
  while state.position <= state.length do
    local character = string.sub(state.text, state.position, state.position)
    if character == '"' then
      state.position = state.position + 1
      return table.concat(parts)
    end
    if character == "\\" then
      local escape = string.sub(state.text, state.position + 1, state.position + 1)
      if escape == "u" then
        local codepoint = decodeHex(state, state.position + 2)
        state.position = state.position + 6
        if codepoint >= 0xd800 and codepoint <= 0xdbff then
          if string.sub(state.text, state.position, state.position + 1) ~= "\\u" then
            decodeError(state, "Unicode-Surrogat besitzt keinen zweiten Teil")
          end
          local low = decodeHex(state, state.position + 2)
          if low < 0xdc00 or low > 0xdfff then
            decodeError(state, "Ungueltiger zweiter Unicode-Surrogatteil")
          end
          codepoint = 0x10000 + ((codepoint - 0xd800) * 0x400) + (low - 0xdc00)
          state.position = state.position + 6
        elseif codepoint >= 0xdc00 and codepoint <= 0xdfff then
          decodeError(state, "Unerwarteter zweiter Unicode-Surrogatteil")
        end
        table.insert(parts, utf8Character(codepoint))
      else
        local decoded = ESCAPE_DECODE[escape]
        if not decoded then
          decodeError(state, "Unbekannte JSON-Escape-Sequenz")
        end
        table.insert(parts, decoded)
        state.position = state.position + 2
      end
    else
      if string.byte(character) < 32 then
        decodeError(state, "Steuerzeichen in JSON-Zeichenfolge")
      end
      table.insert(parts, character)
      state.position = state.position + 1
    end
  end
  decodeError(state, "Nicht abgeschlossene JSON-Zeichenfolge")
end

local function parseNumber(state)
  local first = state.position
  if string.sub(state.text, state.position, state.position) == "-" then
    state.position = state.position + 1
  end
  local character = string.sub(state.text, state.position, state.position)
  if character == "0" then
    state.position = state.position + 1
  elseif string.match(character, "%d") then
    repeat
      state.position = state.position + 1
      character = string.sub(state.text, state.position, state.position)
    until not string.match(character, "%d")
  else
    decodeError(state, "Ungueltige JSON-Zahl")
  end
  if string.sub(state.text, state.position, state.position) == "." then
    state.position = state.position + 1
    if not string.match(string.sub(state.text, state.position, state.position), "%d") then
      decodeError(state, "Ungueltiger Dezimalteil")
    end
    repeat
      state.position = state.position + 1
      character = string.sub(state.text, state.position, state.position)
    until not string.match(character, "%d")
  end
  character = string.sub(state.text, state.position, state.position)
  if character == "e" or character == "E" then
    state.position = state.position + 1
    character = string.sub(state.text, state.position, state.position)
    if character == "+" or character == "-" then
      state.position = state.position + 1
    end
    if not string.match(string.sub(state.text, state.position, state.position), "%d") then
      decodeError(state, "Ungueltiger Exponent")
    end
    repeat
      state.position = state.position + 1
      character = string.sub(state.text, state.position, state.position)
    until not string.match(character, "%d")
  end
  local value = tonumber(string.sub(state.text, first, state.position - 1))
  if value == nil then
    decodeError(state, "JSON-Zahl konnte nicht gelesen werden")
  end
  return value
end

local parseValue

local function parseArray(state)
  state.position = state.position + 1
  skipWhitespace(state)
  local result = {}
  if string.sub(state.text, state.position, state.position) == "]" then
    state.position = state.position + 1
    return result
  end
  while true do
    table.insert(result, parseValue(state))
    skipWhitespace(state)
    local character = string.sub(state.text, state.position, state.position)
    if character == "]" then
      state.position = state.position + 1
      return result
    end
    if character ~= "," then
      decodeError(state, "Komma oder Ende des JSON-Arrays erwartet")
    end
    state.position = state.position + 1
    skipWhitespace(state)
  end
end

local function parseObject(state)
  state.position = state.position + 1
  skipWhitespace(state)
  local result = {}
  if string.sub(state.text, state.position, state.position) == "}" then
    state.position = state.position + 1
    return result
  end
  while true do
    if string.sub(state.text, state.position, state.position) ~= '"' then
      decodeError(state, "JSON-Objektschluessel erwartet")
    end
    local key = parseString(state)
    skipWhitespace(state)
    if string.sub(state.text, state.position, state.position) ~= ":" then
      decodeError(state, "Doppelpunkt nach JSON-Objektschluessel erwartet")
    end
    state.position = state.position + 1
    skipWhitespace(state)
    result[key] = parseValue(state)
    skipWhitespace(state)
    local character = string.sub(state.text, state.position, state.position)
    if character == "}" then
      state.position = state.position + 1
      return result
    end
    if character ~= "," then
      decodeError(state, "Komma oder Ende des JSON-Objekts erwartet")
    end
    state.position = state.position + 1
    skipWhitespace(state)
  end
end

parseValue = function(state)
  skipWhitespace(state)
  local character = string.sub(state.text, state.position, state.position)
  if character == '"' then
    return parseString(state)
  end
  if character == "{" then
    return parseObject(state)
  end
  if character == "[" then
    return parseArray(state)
  end
  if character == "-" or string.match(character, "%d") then
    return parseNumber(state)
  end
  local literals = {
    ["true"] = true,
    ["false"] = false,
    ["null"] = Json.null,
  }
  for token, value in pairs(literals) do
    if string.sub(state.text, state.position, state.position + string.len(token) - 1) == token then
      state.position = state.position + string.len(token)
      return value
    end
  end
  decodeError(state, "Ungueltiger JSON-Wert")
end

function Json.decode(text)
  if type(text) ~= "string" then
    error("JSON-Eingabe muss eine Zeichenfolge sein.")
  end
  if string.sub(text, 1, 3) == "\239\187\191" then
    text = string.sub(text, 4)
  end
  local state = {
    text = text,
    position = 1,
    length = string.len(text),
  }
  local result = parseValue(state)
  skipWhitespace(state)
  if state.position <= state.length then
    decodeError(state, "Unerwartete Zeichen nach dem JSON-Wert")
  end
  return result
end

return Json
