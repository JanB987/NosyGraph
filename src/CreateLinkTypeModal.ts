/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- NosyGraph parses Obsidian frontmatter, Bases data, and persisted graph JSON whose shapes are validated at runtime. */
import { App, Modal, Setting } from "obsidian";

export type LinkTypeMode = "Force Based" | "Direction Based" | "parent" | "lens";

export interface CreateLinkTypePayload {
  property: string;
  properties?: string[];
  writeProperty?: string;
  label: string;
  linkType: LinkTypeMode;
  direction: "incoming" | "outgoing" | "both";
  linkDiscoveryDirection: "incoming" | "outgoing" | "both";
  recursive: boolean;
  linkDiscovery: boolean;
  linkDuplicateNodes: boolean;
  linkForce?: number;
  linkDistance?: number;
  linkDirection?: string;
  linkYAxis?: number;
  linkXAxis?: number;
}

export class CreateLinkTypeModal extends Modal {
  private propertyValue: string;
  private propertyValues: string[];
  private writePropertyValue: string;
  private readonly propertyOptions: string[];
  private readonly onSubmit: (payload: CreateLinkTypePayload) => void;
  private labelValue: string;
  private linkTypeValue: LinkTypeMode = "Force Based";
  private directionValue: "incoming" | "outgoing" | "both" = "outgoing";
  private linkDiscoveryDirectionValue: "incoming" | "outgoing" | "both" = "outgoing";
  private recursiveValue = false;
  private linkDiscoveryValue = true;
  private linkDuplicateNodesValue = false;
  private linkForceValue = 0.01;
  private linkDistanceValue = 120;
  private linkDirectionValue = "right";
  private linkYAxisValue = 1;
  private linkXAxisValue = 0;
  private readonly titleText: string;
  private readonly submitText: string;
  private readonly openFileLabel: string;
  private readonly onOpenFile: (() => void) | null;

  constructor(
    app: App,
    options: {
      propertyOptions: string[];
      initialProperty?: string;
      initialProperties?: string[];
      initialWriteProperty?: string;
      initialLabel?: string;
      initialLinkType?: LinkTypeMode;
      initialDirection?: "incoming" | "outgoing" | "both";
      initialLinkDiscoveryDirection?: "incoming" | "outgoing" | "both";
      initialRecursive?: boolean;
      initialLinkDiscovery?: boolean;
      initialLinkDuplicateNodes?: boolean;
      initialLinkForce?: number;
      initialLinkDistance?: number;
      initialLinkDirection?: string;
      initialLinkYAxis?: number;
      initialLinkXAxis?: number;
      title?: string;
      submitLabel?: string;
      openFileLabel?: string;
      onOpenFile?: () => void;
      onSubmit: (payload: CreateLinkTypePayload) => void;
    }
  ) {
    super(app);
    this.propertyOptions = Array.from(
      new Set(
        (options.propertyOptions ?? [])
          .map((item) => String(item ?? "").trim().toLowerCase())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    const preferred = String(options.initialProperty ?? "").trim().toLowerCase();
    this.propertyValue = this.propertyOptions.includes(preferred)
      ? preferred
      : (this.propertyOptions[0] ?? "");
    const initialProperties = (options.initialProperties ?? [])
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter((item) => this.propertyOptions.includes(item));
    this.propertyValues = Array.from(new Set(initialProperties.length > 0
      ? initialProperties
      : (this.propertyValue ? [this.propertyValue] : [])));
    this.propertyValue = this.propertyValues[0] ?? this.propertyValue;
    const preferredWriteProperty = String(options.initialWriteProperty ?? "").trim().toLowerCase();
    this.writePropertyValue = this.propertyValues.includes(preferredWriteProperty)
      ? preferredWriteProperty
      : (this.propertyValues[0] ?? "");
    this.onSubmit = options.onSubmit;
    this.labelValue = String(options.initialLabel ?? "").trim() || this.suggestLabel(this.propertyValue);
    this.linkTypeValue = options.initialLinkType === "Direction Based"
      ? "Direction Based"
      : options.initialLinkType === "parent"
        ? "parent"
        : options.initialLinkType === "lens"
          ? "lens"
          : "Force Based";
    this.directionValue = options.initialDirection === "incoming" || options.initialDirection === "both"
      ? options.initialDirection
      : "outgoing";
    this.linkDiscoveryDirectionValue = options.initialLinkDiscoveryDirection === "incoming"
      || options.initialLinkDiscoveryDirection === "both"
      ? options.initialLinkDiscoveryDirection
      : "outgoing";
    this.recursiveValue = Boolean(options.initialRecursive);
    this.linkDiscoveryValue = options.initialLinkDiscovery === false ? false : true;
    this.linkDuplicateNodesValue = Boolean(options.initialLinkDuplicateNodes);
    if (this.linkDuplicateNodesValue) {
      this.linkDiscoveryValue = false;
    }
    const initialLinkForce = Number(options.initialLinkForce);
    const initialLinkDistance = Number(options.initialLinkDistance);
    const initialLinkYAxis = Number(options.initialLinkYAxis);
    const initialLinkXAxis = Number(options.initialLinkXAxis);
    this.linkForceValue = Number.isFinite(initialLinkForce) ? initialLinkForce : 0.01;
    this.linkDistanceValue = Number.isFinite(initialLinkDistance) ? initialLinkDistance : 120;
    this.linkDirectionValue = String(options.initialLinkDirection ?? "right").trim().toLowerCase() || "right";
    this.linkYAxisValue = Number.isFinite(initialLinkYAxis) ? initialLinkYAxis : 1;
    this.linkXAxisValue = Number.isFinite(initialLinkXAxis) ? initialLinkXAxis : 0;
    this.titleText = String(options.title ?? "").trim() || "Create LinkType";
    this.submitText = String(options.submitLabel ?? "").trim() || "Create";
    this.openFileLabel = String(options.openFileLabel ?? "").trim();
    this.onOpenFile = typeof options.onOpenFile === "function" ? options.onOpenFile : null;
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.titleText);

    if (this.onOpenFile) {
      new Setting(contentEl)
        .setName("LinkType Note")
        .setDesc("Open the LinkType markdown note")
        .addButton((button) => {
          button
            .setButtonText(this.openFileLabel || "Open File")
            .onClick(() => this.onOpenFile?.());
        });
    }

    if (this.linkTypeValue === "lens") {
      const propertySetting = new Setting(contentEl)
        .setName("Properties")
        .setDesc("Select one or more properties read by this Lens");
      const propertyList = propertySetting.controlEl.createDiv({ cls: "nosygraph-linktype-property-list" });
      for (const property of this.propertyOptions) {
        const label = propertyList.createEl("label", { cls: "nosygraph-linktype-property-option" });
        const checkbox = label.createEl("input", { type: "checkbox" });
        checkbox.checked = this.propertyValues.includes(property);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            this.propertyValues = Array.from(new Set([...this.propertyValues, property]));
          } else {
            this.propertyValues = this.propertyValues.filter((item) => item !== property);
          }
          this.propertyValue = this.propertyValues[0] ?? "";
          if (!this.propertyValues.includes(this.writePropertyValue)) {
            this.writePropertyValue = this.propertyValue;
          }
          this.render();
        });
        label.createSpan({ text: property });
      }

      new Setting(contentEl)
        .setName("Write property")
        .setDesc("Property receiving Lens additions and removals")
        .addDropdown((dropdown) => {
          for (const property of this.propertyValues) {
            dropdown.addOption(property, property);
          }
          dropdown
            .setValue(this.writePropertyValue)
            .setDisabled(this.propertyValues.length === 0)
            .onChange((value) => {
              this.writePropertyValue = String(value ?? "").trim().toLowerCase();
            });
        });
    } else {
      new Setting(contentEl)
        .setName("Property")
        .setDesc("Select a property from nodes in the current graph")
        .addDropdown((dropdown) => {
          for (const property of this.propertyOptions) {
            dropdown.addOption(property, property);
          }
          dropdown
            .setValue(this.propertyValue)
            .onChange((value) => {
              this.propertyValue = String(value ?? "").trim().toLowerCase();
              this.propertyValues = this.propertyValue ? [this.propertyValue] : [];
              if (!this.labelValue) {
                this.labelValue = this.suggestLabel(this.propertyValue);
              }
            });
        });
    }

    new Setting(contentEl)
      .setName("Label")
      .setDesc("Display label for the LinkType")
      .addText((text) => {
        text
          .setPlaceholder("Label")
          .setValue(this.labelValue)
          .onChange((value) => {
            this.labelValue = String(value ?? "").trim();
          });
      });

    new Setting(contentEl)
      .setName("Link Type")
      .setDesc("Layout behavior for this LinkType")
      .addDropdown((dropdown) => {
        dropdown.addOption("Force Based", "Force Based");
        dropdown.addOption("Direction Based", "Direction Based");
        dropdown.addOption("parent", "Parent container");
        dropdown.addOption("lens", "Lens");
        dropdown
          .setValue(this.linkTypeValue)
          .onChange((value) => {
            const next = value === "Direction Based"
              ? "Direction Based"
              : value === "parent"
                ? "parent"
                : value === "lens"
                  ? "lens"
                  : "Force Based";
            if (next === this.linkTypeValue) return;
            this.linkTypeValue = next;
            this.applyTypeDefaults(next);
            this.render();
          });
      });

    if (this.linkTypeValue !== "lens") {
      new Setting(contentEl)
        .setName("Direction")
        .setDesc("How links should be interpreted")
        .addDropdown((dropdown) => {
          dropdown.addOption("outgoing", "outgoing");
          dropdown.addOption("incoming", "incoming");
          dropdown.addOption("both", "both");
          dropdown
            .setValue(this.directionValue)
            .onChange((value) => {
              this.directionValue = value === "incoming" || value === "both" ? value : "outgoing";
            });
        });
    }

    new Setting(contentEl)
      .setName("Discovery Direction")
      .setDesc(this.linkTypeValue === "lens"
        ? "Lens discovery currently supports outgoing links only"
        : "Outgoing reads links on the current note; incoming finds notes that point to it")
      .addDropdown((dropdown) => {
        dropdown.addOption("outgoing", "outgoing");
        if (this.linkTypeValue !== "lens") {
          dropdown.addOption("incoming", "incoming");
          dropdown.addOption("both", "both");
        }
        dropdown
          .setValue(this.linkTypeValue === "lens" ? "outgoing" : this.linkDiscoveryDirectionValue)
          .setDisabled(this.linkTypeValue === "lens")
          .onChange((value) => {
            this.linkDiscoveryDirectionValue = value === "incoming" || value === "both"
              ? value
              : "outgoing";
          });
      });

    if (this.linkTypeValue !== "lens") {
      new Setting(contentEl)
        .setName("Recursive")
        .setDesc("Follow links recursively")
        .addToggle((toggle) => {
          toggle
            .setValue(this.recursiveValue)
            .onChange((value) => {
              this.recursiveValue = Boolean(value);
            });
        });

      new Setting(contentEl)
        .setName("Link Discovery")
        .setDesc("Auto-connect visible nodes for this LinkType")
        .addToggle((toggle) => {
          toggle.setDisabled(this.linkDuplicateNodesValue);
          toggle
            .setValue(this.linkDiscoveryValue)
            .onChange((value) => {
              this.linkDiscoveryValue = Boolean(value);
            });
        });

      new Setting(contentEl)
        .setName("Duplicate Nodes")
        .setDesc("Create a separate child node for each parent edge")
        .addToggle((toggle) => {
          toggle
            .setValue(this.linkDuplicateNodesValue)
            .onChange((value) => {
              this.linkDuplicateNodesValue = Boolean(value);
              if (this.linkDuplicateNodesValue) {
                this.linkDiscoveryValue = false;
              }
              this.render();
            });
        });
    }

    if (this.linkTypeValue === "Force Based") {
      new Setting(contentEl)
        .setName("Link Force")
        .setDesc("Spring force strength for this link type")
        .addText((text) => {
          text
            .setPlaceholder("0.01")
            .setValue(String(this.linkForceValue))
            .onChange((value) => {
              const n = Number(value);
              if (Number.isFinite(n)) {
                this.linkForceValue = n;
              }
            });
          text.inputEl.type = "number";
          text.inputEl.step = "0.001";
          text.inputEl.min = "0";
        });

      new Setting(contentEl)
        .setName("Link Distance")
        .setDesc("Preferred distance for this link type")
        .addText((text) => {
          text
            .setPlaceholder("120")
            .setValue(String(this.linkDistanceValue))
            .onChange((value) => {
              const n = Number(value);
              if (Number.isFinite(n)) {
                this.linkDistanceValue = n;
              }
            });
          text.inputEl.type = "number";
          text.inputEl.step = "1";
          text.inputEl.min = "1";
        });
    } else if (this.linkTypeValue === "Direction Based") {
      new Setting(contentEl)
        .setName("Link Direction")
        .setDesc("Direction behavior for direction-based links")
        .addDropdown((dropdown) => {
          dropdown.addOption("right", "right");
          dropdown.addOption("left", "left");
          dropdown.addOption("down", "down");
          dropdown.addOption("up", "up");
          dropdown
            .setValue(this.linkDirectionValue)
            .onChange((value) => {
              const normalized = String(value ?? "").trim().toLowerCase();
              this.linkDirectionValue = (
                normalized === "left" || normalized === "up" || normalized === "down"
              ) ? normalized : "right";
            });
        });

      new Setting(contentEl)
        .setName("Link Y Axis")
        .setDesc("Y-axis influence factor")
        .addText((text) => {
          text
            .setPlaceholder("1")
            .setValue(String(this.linkYAxisValue))
            .onChange((value) => {
              const n = Number(value);
              if (Number.isFinite(n)) {
                this.linkYAxisValue = n;
              }
            });
          text.inputEl.type = "number";
          text.inputEl.step = "0.1";
        });

      new Setting(contentEl)
        .setName("Link X Axis")
        .setDesc("X-axis influence factor")
        .addText((text) => {
          text
            .setPlaceholder("0")
            .setValue(String(this.linkXAxisValue))
            .onChange((value) => {
              const n = Number(value);
              if (Number.isFinite(n)) {
                this.linkXAxisValue = n;
              }
            });
          text.inputEl.type = "number";
          text.inputEl.step = "0.1";
        });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(this.submitText)
          .setCta()
          .onClick(() => {
            const property = String(this.propertyValue ?? "").trim().toLowerCase();
            const properties = this.linkTypeValue === "lens"
              ? Array.from(new Set(this.propertyValues.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)))
              : (property ? [property] : []);
            const writeProperty = this.linkTypeValue === "lens"
              ? String(this.writePropertyValue ?? "").trim().toLowerCase()
              : "";
            const label = String(this.labelValue ?? "").trim();
            if (!property || !label || properties.length === 0) return;
            if (properties.some((item) => !this.propertyOptions.includes(item))) return;
            if (this.linkTypeValue === "lens" && (!writeProperty || !properties.includes(writeProperty))) return;

            const payload: CreateLinkTypePayload = {
              property,
              ...(this.linkTypeValue === "lens" ? { properties, writeProperty } : {}),
              label,
              linkType: this.linkTypeValue,
              direction: this.linkTypeValue === "lens" ? "outgoing" : this.directionValue,
              linkDiscoveryDirection: this.linkTypeValue === "lens"
                ? "outgoing"
                : this.linkDiscoveryDirectionValue,
              recursive: this.linkTypeValue === "lens" ? false : this.recursiveValue,
              linkDiscovery: this.linkTypeValue === "lens"
                ? false
                : (this.linkDuplicateNodesValue ? false : this.linkDiscoveryValue),
              linkDuplicateNodes: this.linkTypeValue === "lens" ? false : this.linkDuplicateNodesValue
            };
            if (this.linkTypeValue === "Force Based") {
              payload.linkForce = this.linkForceValue;
              payload.linkDistance = this.linkDistanceValue;
            } else if (this.linkTypeValue === "Direction Based") {
              payload.linkDirection = this.linkDirectionValue;
              payload.linkYAxis = this.linkYAxisValue;
              payload.linkXAxis = this.linkXAxisValue;
            }
            this.onSubmit(payload);
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Cancel")
          .onClick(() => this.close());
      });
  }

  private applyTypeDefaults(type: LinkTypeMode): void {
    if (type !== "Direction Based") {
      this.linkForceValue = 0.01;
      this.linkDistanceValue = 120;
      return;
    }
    this.linkDirectionValue = "right";
    this.linkYAxisValue = 1;
    this.linkXAxisValue = 0;
  }

  private suggestLabel(property: string): string {
    if (!property) return "LinkType";
    return property.charAt(0).toUpperCase() + property.slice(1);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unnecessary-type-assertion -- Re-enable dynamic-data lint rules after this module. */
