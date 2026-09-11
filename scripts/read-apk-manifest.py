#!/usr/bin/env python3
"""Minimal Android binary-XML (AXML) reader for built APKs.

Reports what a released APK *actually* declares: the permissions it requests and
the identity/version attributes that decide whether it can install over an older
build. Worth having because a raw string search of AndroidManifest.xml matches
strings that sit in the pool without being referenced — which makes an APK look
like it asks for permissions it never uses. These strings are shown to the user
on the install screen, so ground truth matters.

Usage:
    unzip -p calibrEAT.apk AndroidManifest.xml > /tmp/AndroidManifest.xml
    python3 scripts/read-apk-manifest.py /tmp/AndroidManifest.xml
"""

import struct
import sys

STRING_POOL = 0x0001
START_ELEMENT = 0x0102
UTF8_FLAG = 0x100

# TypedValue dataType values we care about.
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12
TYPE_STRING = 0x03
TYPE_REFERENCE = 0x01

IDENTITY_ATTRIBUTES = {
    'package', 'versionCode', 'versionName',
    'minSdkVersion', 'targetSdkVersion', 'compileSdkVersion',
    'debuggable', 'label',
}


def read_string_pool(raw, offset):
    """Return the chunk's string list, or None if this chunk is not a pool."""
    chunk_type, _, _ = struct.unpack_from('<HHI', raw, offset)
    if chunk_type != STRING_POOL:
        return None
    count, _, flags, strings_start, _ = struct.unpack_from('<IIIII', raw, offset + 8)
    offsets = struct.unpack_from(f'<{count}I', raw, offset + 28)
    base = offset + strings_start
    utf8 = bool(flags & UTF8_FLAG)

    strings = []
    for string_offset in offsets:
        if string_offset == 0xFFFFFFFF:
            strings.append(None)
            continue
        pos = base + string_offset
        if utf8:
            pos += 1                     # skip the UTF-16 length byte
            byte_len = raw[pos]
            pos += 1
            strings.append(raw[pos:pos + byte_len].decode('utf-8', errors='replace'))
        else:
            char_len = struct.unpack_from('<H', raw, pos)[0]
            pos += 2
            if char_len & 0x8000:        # long string: second length word follows
                char_len = ((char_len & 0x7FFF) << 16) | struct.unpack_from('<H', raw, pos)[0]
                pos += 2
            strings.append(raw[pos:pos + char_len * 2].decode('utf-16-le', errors='replace'))
    return strings


def walk(raw):
    """Yield (element_name, [{name, raw, type, data}]) for each start element."""
    strings = None
    offset = 8
    while offset < len(raw) - 8:
        chunk_type, _, chunk_size = struct.unpack_from('<HHI', raw, offset)
        if chunk_size < 8:
            break
        if chunk_type == STRING_POOL:
            strings = read_string_pool(raw, offset)
        elif chunk_type == START_ELEMENT and strings:
            # ResXMLTree_attrExt: ns at +16, name at +20, attributeStart at +24,
            # attributeSize at +26, attributeCount at +28.
            name_index = struct.unpack_from('<I', raw, offset + 20)[0]
            attribute_start = struct.unpack_from('<H', raw, offset + 24)[0]
            attribute_count = struct.unpack_from('<H', raw, offset + 28)[0]
            attributes = []
            for i in range(attribute_count):
                # attributeStart is relative to the attrExt struct at +16, not to
                # the node; attributes are ResXMLTree_attribute records of 20
                # bytes: ns, name, rawValue, then a typed value.
                attr = offset + 16 + attribute_start + i * 20
                name_i, raw_i = struct.unpack_from('<II', raw, attr + 4)
                data_type = raw[attr + 15]
                data = struct.unpack_from('<I', raw, attr + 16)[0]
                attributes.append({
                    'name': strings[name_i] if name_i < len(strings) else None,
                    'raw': strings[raw_i] if raw_i < len(strings) else None,
                    'type': data_type,
                    'data': data,
                })
            yield strings[name_index] if name_index < len(strings) else None, attributes
        offset += chunk_size


def display(attribute):
    if attribute['raw'] is not None:
        return attribute['raw']
    data_type, data = attribute['type'], attribute['data']
    if data_type == TYPE_INT_BOOLEAN:
        return 'true' if data else 'false'
    if data_type == TYPE_INT_DEC:
        return str(data)
    if data_type == TYPE_INT_HEX:
        return hex(data)
    if data_type == TYPE_REFERENCE:
        return f'@resource/0x{data:08x}'
    if data_type == TYPE_STRING:
        return '(string)'
    return f'(0x{data_type:02x}:{data})'


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'AndroidManifest.xml'
    with open(path, 'rb') as handle:
        raw = handle.read()

    if raw[:4] != b'\x03\x00\x08\x00':
        print('Not an AXML file — expected a binary AndroidManifest.xml')
        return 1

    permissions = []
    identity = {}
    counts = {}
    for element, attributes in walk(raw):
        counts[element] = counts.get(element, 0) + 1
        if element == 'uses-permission':
            for attribute in attributes:
                if attribute['name'] == 'name' and attribute['raw']:
                    permissions.append(attribute['raw'])
        elif element in ('manifest', 'uses-sdk', 'application'):
            for attribute in attributes:
                if attribute['name'] in IDENTITY_ATTRIBUTES:
                    identity[attribute['name']] = display(attribute)

    print(f'Elements: {", ".join(f"{k}×{v}" for k, v in sorted(counts.items()))}\n')
    print(f'Identity: {identity or "none found"}\n')
    print(f'{len(set(permissions))} permission(s) requested:')
    for permission in sorted(set(permissions)):
        print(f'  {permission}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
