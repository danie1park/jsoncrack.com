import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);

  const [editing, setEditing] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setError(null);
    setEditing(false);
    setEditedContent(normalizeNodeData(nodeData?.text ?? []));
  }, [nodeData, opened]);

  // helper to apply the parsed node JSON to the main JSON string and call setJson
  const applyEditToJson = (path: NodeData["path"] | undefined, newValue: any) => {
    try {
      const current = useJson.getState().getJson();
      let parsedCurrent: any = {};
      try {
        parsedCurrent = JSON.parse(current);
      } catch (e) {
        // if current is empty or invalid, start fresh
        parsedCurrent = {};
      }

      if (!path || path.length === 0) {
        // replace root
        const jsonStr = JSON.stringify(newValue, null, 2);
        // directly update file store without triggering debounced update
        useFile.setState({ contents: jsonStr, hasChanges: true });
        // immediate graph update
        useJson.getState().setJson(jsonStr);
        // re-select root node if exists
        const rootNode = useGraph.getState().nodes.find(n => !n.path || n.path.length === 0) ?? null;
        if (rootNode) useGraph.getState().setSelectedNode(rootNode);
        return;
      }

      // navigate to parent of target
      let parent = parsedCurrent;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i] as any;
        if (parent[seg] === undefined) parent[seg] = {};
        parent = parent[seg];
      }

      const lastSeg = path[path.length - 1] as any;

      // If newValue is an object and existing target is object, merge shallowly
      if (newValue !== null && typeof newValue === "object" && !Array.isArray(newValue)) {
        const target = parent[lastSeg];
        if (target && typeof target === "object" && !Array.isArray(target)) {
          parent[lastSeg] = { ...target, ...newValue };
        } else {
          parent[lastSeg] = newValue;
        }
      } else {
        // primitives or arrays: replace
        parent[lastSeg] = newValue;
      }

      const jsonStr = JSON.stringify(parsedCurrent, null, 2);
      // directly update file store without triggering debounced update
      useFile.setState({ contents: jsonStr, hasChanges: true });
      // immediate graph update
      useJson.getState().setJson(jsonStr);

      // find and reselect the updated node by path
      const nodes = useGraph.getState().nodes;
      const match = nodes.find(n => JSON.stringify(n.path || []) === JSON.stringify(path || []));
      if (match) {
        useGraph.getState().setSelectedNode(match);
        // update the local edited content to the newly parsed node text
        // (so the modal shows the updated representation)
        setEditedContent(normalizeNodeData(match.text ?? []));
      }
    } catch (err) {
      throw err;
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {!editing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                autosize
                minRows={4}
                maxRows={15}
                value={editedContent}
                onChange={e => setEditedContent(e.currentTarget.value)}
                data-testid="node-edit-textarea"
              />
            )}
          </ScrollArea.Autosize>
          <Flex justify="flex-end" gap="xs">
            {!editing ? (
              <Button size="xs" variant="light" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : (
              <>
                <Button
                  size="xs"
                  color="green"
                  onClick={() => {
                    setError(null);
                    try {
                      const parsed = JSON.parse(editedContent);
                      applyEditToJson(nodeData?.path, parsed);
                      setEditing(false);
                      // keep modal open and reselect updated node
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  Save
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditedContent(normalizeNodeData(nodeData?.text ?? []));
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </Flex>
          {error ? (
            <Text color="red" fz="xs">
              {error}
            </Text>
          ) : null}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
