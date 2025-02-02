// @flow
import { copyFixtureIntoTempDir } from "jest-fixtures";
import stripAnsi from "strip-ansi";
import { askCheckboxPlus, askConfirm, askQuestion } from "../../../utils/cli";
import * as git from "../../../utils/git";
import addChangeset from "..";
import writeChangeset from "../writeChangeset";

/*
    Bumping peerDeps is a tricky issue, so we are testing every single combination here so that
    we can have absolute certainty when changing anything to do with them.
    In general the rule for bumping peerDeps is that:
      * All MINOR or MAJOR peerDep bumps must MAJOR bump all dependents - regardless of ranges
      * Otherwise - normal patching rules apply
 */

jest.mock("../../../utils/logger");
jest.mock("../../../utils/cli");
jest.mock("../../../utils/git");
jest.mock("../../../commands/add/writeChangeset");

// This is some sad flow hackery
const unsafeGetChangedPackagesSinceMaster: any =
  git.getChangedPackagesSinceMaster;
unsafeGetChangedPackagesSinceMaster.mockReturnValue([]);

// type releases = {
//   [string]: string
// };
// type dependent = {
//   name: string,
//   type: string,
//   dependencies: Array<string>
// };
// type mockResponses = {
//   summary?: string,
//   shouldCommit?: string,
//   releases: releases,
//   dependents?: Array<dependent>
// };

const mockUserResponses = mockResponses => {
  const summary = mockResponses.summary || "summary message mock";
  let majorReleases = [];
  let minorReleases = [];
  Object.entries(mockResponses.releases).forEach(([pkgName, type]) => {
    if (type === "major") {
      majorReleases.push(pkgName);
    } else if (type === "minor") {
      minorReleases.push(pkgName);
    }
  });
  let callCount = 0;
  let returnValues = [
    Object.keys(mockResponses.releases),
    majorReleases,
    minorReleases
  ];
  askCheckboxPlus.mockImplementation(() => {
    if (callCount === returnValues.length) {
      throw new Error(`There was an unexpected call to askCheckboxPlus`);
    }
    return returnValues[callCount++];
  });

  let confirmAnswers = {
    "Is this your desired changeset?": true
  };

  askQuestion.mockReturnValueOnce(summary);
  askConfirm.mockImplementation(question => {
    question = stripAnsi(question);
    if (confirmAnswers[question]) {
      return confirmAnswers[question];
    }
    throw new Error(`An answer could not be found for ${question}`);
  });
};

describe("Changesets - bumping peerDeps", () => {
  beforeEach(() => {
    writeChangeset.mockResolvedValue("ABCDE");
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should patch a pinned peerDep", async () => {
    // Bumping a pinned peer dep should patch the dependent - regular bumping rules
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-pinned-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "patch" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "patch" }],
      dependents: [
        {
          name: "has-peer-dep",
          type: "patch",
          dependencies: ["depended-upon"]
        }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should not bump the dependent when bumping a tilde peerDep by patch", async () => {
    // since we aren't leaving the version range AND the bumptype is patch, we should not bump
    // any dependents
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-tilde-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "patch" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "patch" }],
      dependents: []
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should major bump dependent when bumping a tilde peerDep by minor", async () => {
    // minor bump that is leaving version range, therefore: major bump to dependent
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-tilde-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "minor" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "minor" }],
      dependents: [
        {
          name: "has-peer-dep",
          type: "major",
          dependencies: ["depended-upon"]
        }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should major bump dependent when bumping a tilde peerDep by major", async () => {
    // example: same example as above, should major bump the dependent
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-tilde-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "major" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "major" }],
      dependents: [
        {
          name: "has-peer-dep",
          type: "major",
          dependencies: ["depended-upon"]
        }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should not bump dependent when bumping caret peerDep by patch", async () => {
    // example: We are not leaving the semver range, so we should not be bumping
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-caret-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "patch" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "patch" }],
      dependents: []
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should major bump dependent when bumping caret peerDep by minor", async () => {
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-caret-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "minor" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "minor" }],
      dependents: [
        {
          name: "has-peer-dep",
          type: "major",
          dependencies: ["depended-upon"]
        }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should major bump dependent when bumping caret peerDep by major", async () => {
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "simple-caret-peer-dep"
    );
    mockUserResponses({ releases: { "depended-upon": "major" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "depended-upon", type: "major" }],
      dependents: [
        {
          name: "has-peer-dep",
          type: "major",
          dependencies: ["depended-upon"]
        }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });

  it("should patch bump transitive dep that is only affected by peerDep bump", async () => {
    // example: pkg-b has a caretDep on pkg-a and a caret dep on pkg-c, pkg-c has a caret peerDep
    // on pkg-a.
    // Minor bumping pkg-a should not cause pkg-b to release, but will cause a major on pkg-c, which
    // in turn patches pkg-b
    const cwd = await copyFixtureIntoTempDir(
      __dirname,
      "previously-checked-transitive-peer-dependent"
    );
    mockUserResponses({ releases: { "pkg-a": "minor" } });
    await addChangeset({ cwd });

    const expectedChangeset = {
      summary: "summary message mock",
      releases: [{ name: "pkg-a", type: "minor" }],
      dependents: [
        { name: "pkg-c", type: "major", dependencies: ["pkg-a"] },
        { name: "pkg-b", type: "patch", dependencies: ["pkg-c", "pkg-a"] }
      ]
    };
    const call = writeChangeset.mock.calls[0][0];
    expect(call).toEqual(expectedChangeset);
  });
});
