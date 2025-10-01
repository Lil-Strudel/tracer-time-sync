import axios from "redaxios";

export interface AuthResponse {
  token: string;
  expiration: string;
}

export interface RawTimeAttributes {
  source: string;
  sub_split_kind: "in" | "out";
  with_pacer: "true" | "false";
  entered_time: string;
  split_name: string;
  bib_number: string;
  stopped_here: "true" | "false";
}

export interface RawTimePayload {
  type: "raw_time";
  attributes: RawTimeAttributes;
}

export interface PostRawTimesRequest {
  data: RawTimePayload[];
  data_format: "jsonapi_batch";
  limited_response: "true" | "false";
}

export class OpenSplitTimeAPI {
  private baseUrl = "https://www.opensplittime.org/api/v1";

  async getApiKey(email: string, password: string): Promise<AuthResponse> {
    const res = await axios.post<AuthResponse>(`${this.baseUrl}/auth`, {
      user: { email, password },
    });
    return res.data;
  }

  async postRawTimes(
    eventGroupId: string,
    payload: PostRawTimesRequest,
    apiKey: string,
  ): Promise<any> {
    const res = await axios.post(
      `${this.baseUrl}/event_groups/${eventGroupId}/import`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    return res.data;
  }
}
