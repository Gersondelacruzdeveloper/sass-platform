import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(
  process.cwd(),
  "src/modules/ticketing/pages/TicketingSellersPage.tsx",
);

const source = readFileSync(
  sourcePath,
  "utf8",
);

function visiblePermissionKeysFromSource() {
  const match = source.match(
    /const permissionGroups:\s*PermissionGroup\[\]\s*=\s*\[(.*?)\];\s*\/\/ Keep all legacy permission fields/s,
  );

  if (!match) {
    throw new Error(
      "Could not find permissionGroups in TicketingSellersPage.tsx",
    );
  }

  return [
    ...match[1].matchAll(
      /keys:\s*\[\s*"([^"]+)"\s*\]/g,
    ),
  ].map(
    (entry) => entry[1],
  );
}

describe(
  "TicketingSellersPage simplified permissions",
  () => {
    it(
      "exposes exactly the three business permissions requested",
      () => {
        expect(
          visiblePermissionKeysFromSource(),
        ).toEqual([
          "can_send_payment_links",
          "can_create_pending_payment_booking",
          "can_generate_ticket_without_customer_online_payment",
        ]);
      },
    );

    it(
      "keeps legacy permissions in the payload for backwards compatibility",
      () => {
        expect(source).toContain(
          "const permissionKeys = Object.keys(permissionLabels)",
        );

        expect(source).toContain(
          "permissionKeys.forEach((key) => {",
        );

        expect(source).toContain(
          "appendBoolean(formData, key, Boolean(form[key]));",
        );
      },
    );

    it(
      "uses simple administrator-facing labels",
      () => {
        expect(source).toContain(
          'title: "Customer links"',
        );

        expect(source).toContain(
          'title: "Pending tickets"',
        );

        expect(source).toContain(
          'title: "Paid / seller-credit tickets"',
        );
      },
    );
  },
);