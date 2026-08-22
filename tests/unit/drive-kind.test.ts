import { describe, expect, it } from "vitest";

import {
  driveFolderIdValid,
  driveKindLabel,
  isDriveFolder,
} from "@/lib/google/drive-kind";

describe("driveKindLabel", () => {
  it("labels the Google Workspace types", () => {
    expect(driveKindLabel("application/vnd.google-apps.folder")).toBe("Folder");
    expect(driveKindLabel("application/vnd.google-apps.document")).toBe("Doc");
    expect(driveKindLabel("application/vnd.google-apps.spreadsheet")).toBe("Sheet");
    expect(driveKindLabel("application/vnd.google-apps.presentation")).toBe("Slides");
    expect(driveKindLabel("application/pdf")).toBe("PDF");
  });

  it("labels media by prefix and everything else as File", () => {
    expect(driveKindLabel("image/png")).toBe("Image");
    expect(driveKindLabel("video/mp4")).toBe("Video");
    expect(driveKindLabel("audio/mpeg")).toBe("Audio");
    expect(driveKindLabel("application/zip")).toBe("File");
  });
});

describe("isDriveFolder", () => {
  it("is true only for the folder mime", () => {
    expect(isDriveFolder("application/vnd.google-apps.folder")).toBe(true);
    expect(isDriveFolder("application/pdf")).toBe(false);
  });
});

describe("driveFolderIdValid", () => {
  it("accepts real Drive ids and rejects junk that could break the query", () => {
    expect(driveFolderIdValid("1AXmsGWWbzrKbT135cknvLumJ1opAhkU1")).toBe(true);
    expect(driveFolderIdValid("12Nei6xxWDJghUXTxC80o9_XgjPki4-lP")).toBe(true);
    expect(driveFolderIdValid("short")).toBe(false);
    expect(driveFolderIdValid("id' or '1'='1")).toBe(false);
    expect(driveFolderIdValid("")).toBe(false);
  });
});
